#!/usr/bin/env python3
"""Ubuntu 24.04 BYOC deployment. No shell expansion; secrets are never arguments."""
import argparse
import base64
from contextlib import contextmanager
import datetime as dt
import fcntl
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import socket
import stat
import subprocess
import sys
import tempfile
from urllib.parse import urlsplit

ROOT = Path('/opt/niq')
CONFIG = Path('/etc/niq')
TRUSTED_UID = 0
TRUST_BOUNDARY = Path('/')
PACKAGES = ['docker.io', 'docker-compose-v2', 'nginx', 'certbot', 'python3-certbot-nginx',
            'ca-certificates', 'curl', 'openssl', 'gnupg']


class Stop(Exception):
    pass


def run(command, **kwargs):
    # Do not echo commands: future commands may contain confidential inputs.
    try:
        return subprocess.run(command, check=True, text=True, **kwargs)
    except subprocess.CalledProcessError as error:
        raise Stop(f'{command[0]} failed (exit {error.returncode}). Correct the issue and rerun.') from error


def validate_domain(value):
    value = value.lower().rstrip('.')
    if len(value) > 253 or '.' not in value or not all(
        re.fullmatch(r'[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?', part)
        for part in value.split('.')
    ):
        raise Stop('Supply a DNS hostname, without protocol, port, path or wildcard.')
    try:
        ipaddress.ip_address(value)
    except ValueError:
        return value
    raise Stop('A domain name is required, not an IP address.')


def check_dns(domain, expected, resolver=socket.getaddrinfo):
    expected = {str(ipaddress.ip_address(value)) for value in expected}
    if not expected or any(not ipaddress.ip_address(value).is_global for value in expected):
        raise Stop('Supply this server’s public IP addresses; private/loopback addresses are not accepted.')
    try:
        actual = {str(ipaddress.ip_address(row[4][0])) for row in resolver(domain, 443, type=socket.SOCK_STREAM)}
    except socket.gaierror as error:
        raise Stop('DNS is not configured. Correct the domain records, then rerun the same command.') from error
    if not actual or actual != expected:
        raise Stop('DNS does not match the supplied server IP addresses. Correct A/AAAA records, then rerun. CDN proxies are not supported by this installer.')
    return sorted(actual)


def check_ubuntu(path=Path('/etc/os-release')):
    values = dict(line.split('=', 1) for line in path.read_text().splitlines() if '=' in line)
    if values.get('ID', '').strip('"') != 'ubuntu' or values.get('VERSION_ID', '').strip('"') != '24.04':
        raise Stop('Only Ubuntu 24.04 LTS is supported. No changes were made.')


def validate_scoring(value):
    # urlsplit silently strips some controls; never persist the original value
    # as a dotenv line until they have been rejected explicitly.
    if any(character.isspace() or ord(character) < 32 or ord(character) == 127 for character in value):
        raise Stop('Scoring URL cannot contain whitespace or control characters.')
    try:
        parsed = urlsplit(value)
        parsed.port  # Validate the optional port before saving configuration.
    except ValueError as error:
        raise Stop('Scoring URL has an invalid host or port.') from error
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise Stop('Scoring URL must use HTTPS without credentials, query parameters or fragments.')
    validate_domain(parsed.hostname)
    return value.rstrip('/')


def validate_chain(path, private=False):
    """Reject unsafe managed paths before a privileged create, read or replace."""
    path = Path(path)
    if not path.is_absolute() or '..' in path.parts:
        raise Stop('Managed paths must be absolute and canonical.')
    try:
        parts = path.relative_to(TRUST_BOUNDARY).parts
    except ValueError as error:
        raise Stop('Managed path is outside the trusted filesystem boundary.') from error
    current = TRUST_BOUNDARY
    for part in (None, *parts):
        if part is not None:
            current = current / part
        try:
            info = current.lstat()
        except FileNotFoundError:
            break
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != TRUSTED_UID or info.st_mode & 0o022:
            raise Stop(f'Refusing untrusted directory: {current}')
        if current == path and private and info.st_mode & 0o077:
            raise Stop(f'Managed directory must be private (0700): {current}')


def ensure_private_directory(path):
    validate_chain(path, private=True)
    path.mkdir(mode=0o700, parents=True, exist_ok=True)
    validate_chain(path, private=True)


def validate_private_file(path):
    validate_chain(path.parent, private=True)
    try:
        info = path.lstat()
    except FileNotFoundError:
        return False
    if not stat.S_ISREG(info.st_mode) or info.st_uid != TRUSTED_UID or info.st_mode & 0o077 or info.st_nlink != 1:
        raise Stop(f'Refusing untrusted private file: {path}')
    return True


@contextmanager
def deployment_lock():
    ensure_private_directory(ROOT)
    path = ROOT / 'installer.lock'
    validate_private_file(path)
    descriptor = os.open(path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        info = os.fstat(descriptor)
        if not stat.S_ISREG(info.st_mode) or info.st_uid != TRUSTED_UID or info.st_mode & 0o077 or info.st_nlink != 1:
            raise Stop('Installer lock is not a private, root-owned regular file.')
        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise Stop('Another installation or upgrade is running.') from error
        yield
    finally:
        os.close(descriptor)


def write_private(path, value):
    ensure_private_directory(path.parent)
    validate_private_file(path)
    fd, name = tempfile.mkstemp(prefix='.' + path.name + '.', dir=path.parent)
    temporary = Path(name)
    try:
        with os.fdopen(fd, 'w') as stream:
            stream.write(value)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def save_state(state):
    write_private(ROOT / 'state.json', json.dumps(state, indent=2) + '\n')


def load_state():
    path = ROOT / 'state.json'
    validate_chain(ROOT, private=True)
    return json.loads(path.read_text()) if validate_private_file(path) else {}


def schema_digest(source):
    digest = hashlib.sha256()
    files = sorted((source / 'apps/api/drizzle').rglob('*'))
    for path in files:
        if path.is_file():
            digest.update(str(path.relative_to(source)).encode())
            digest.update(path.read_bytes())
    return digest.hexdigest()


def stage_release(source, release):
    ensure_private_directory(ROOT / 'releases')
    target = ROOT / 'releases' / release
    validate_chain(target, private=True)
    # An immutable completed marker prevents retrying a half-copied source tree.
    if not (target / '.byoc-release-ready').exists():
        raise Stop('Release staging incomplete. Remove that release directory and rerun with a fresh release identifier.')
    return target


def create_release(source, release):
    ensure_private_directory(ROOT)
    ensure_private_directory(ROOT / 'releases')
    target = ROOT / 'releases' / release
    validate_chain(target, private=True)
    if not target.exists():
        shutil.copytree(source, target, symlinks=False, ignore=shutil.ignore_patterns(
            '.git', 'node_modules', '.env*', '.turbo', 'dist', 'output', 'coverage', '*.log', '*.key', '*.pem', '__pycache__'))
        target.chmod(0o700)
        validate_chain(target, private=True)
        (target / '.byoc-release-ready').write_text('ready\n')
    return stage_release(source, release)


def compose(source, release, *arguments):
    # Compose gives process variables precedence over --env-file. Never inherit
    # ambient credentials or feature switches instead of the private deployment file.
    env = {key: os.environ[key] for key in ('PATH', 'HOME', 'LANG', 'LC_ALL') if key in os.environ}
    env['NIQ_RELEASE'] = release
    return run(['docker', 'compose', '--project-name', 'niq-byoc', '--env-file', str(CONFIG / 'byoc.env'),
                '-f', str(source / 'compose.byoc.yaml'), *arguments], env=env)


def nginx_config(domain):
    return f'''# Managed by NIQ BYOC installer. Do not edit this file.
server {{
  listen 80;
  listen [::]:80;
  server_name {domain};
  client_max_body_size 12m;
  location /api/ {{
    proxy_pass http://127.0.0.1:3000/;
    proxy_http_version 1.1;
    proxy_read_timeout 750s;
    proxy_buffering off;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
  }}
  location / {{
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
  }}
}}
'''


def init_config(args):
    envfile = CONFIG / 'byoc.env'
    ensure_private_directory(CONFIG)
    if validate_private_file(envfile):
        if envfile.stat().st_mode & 0o077:
            raise Stop('Configuration permissions are unsafe; restrict /etc/niq/byoc.env to root (0600).')
        values = dict(line.split('=', 1) for line in envfile.read_text().splitlines() if '=' in line)
        if values.get('NIQ_DOMAIN') != args.domain or values.get('SCORING_API_URL') != args.scoring_url:
            raise Stop('Existing deployment domain or Scoring URL differs. Use the documented migration process.')
        if not values.get('APP_DATABASE_PASSWORD'):
            values['APP_DATABASE_PASSWORD'] = secrets.token_hex(32)
            write_private(envfile, ''.join(f'{key}={value}\n' for key, value in values.items()))
        token = values.get('BYOC_SETUP_TOKEN', '')
        if not token and not values.get('BYOC_SETUP_EXPIRES_AT'):
            # An operator may disable the completed one-time setup without
            # preventing upgrades. Do not implicitly re-enable it.
            return
        if len(token) < 32:
            raise Stop('Existing setup credential is invalid. Repair the private configuration before continuing.')
        # Recover a crash between saving env and creating the operator-facing key.
        tokenfile = CONFIG / 'setup-token'
        validate_private_file(tokenfile)
        if not tokenfile.exists() or tokenfile.read_text().strip() != token:
            write_private(tokenfile, token + '\n')
        return
    token = secrets.token_urlsafe(48)
    values = {'NIQ_DOMAIN': args.domain, 'SCORING_API_URL': args.scoring_url,
              'DB_BACKUP_PORT': '5433', 'BYOC_UPLOAD_ROOT': '/var/lib/niq/report-uploads',
              'POSTGRES_PASSWORD': secrets.token_hex(32), 'APP_DATABASE_PASSWORD': secrets.token_hex(32), 'SESSION_SECRET': secrets.token_hex(48),
              'PATIENT_DATA_ENCRYPTION_KEY': base64.b64encode(secrets.token_bytes(32)).decode(),
              'SCORING_CREDENTIAL_ENCRYPTION_KEY': base64.b64encode(secrets.token_bytes(32)).decode(),
              'NIQ_RELEASE': args.release, 'BYOC_SETUP_TOKEN': token,
              'BYOC_SETUP_EXPIRES_AT': (dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=24)).isoformat()}
    write_private(envfile, ''.join(f'{key}={value}\n' for key, value in values.items()))
    write_private(CONFIG / 'setup-token', token + '\n')


def preflight(args):
    check_ubuntu()
    args.domain = validate_domain(args.domain)
    args.scoring_url = validate_scoring(args.scoring_url)
    check_dns(args.domain, args.server_ip)
    if shutil.disk_usage('/').free < 20 * 1024**3:
        raise Stop('At least 20 GiB free disk space is required.')
    if os.sysconf('SC_PHYS_PAGES') * os.sysconf('SC_PAGE_SIZE') < 4 * 1024**3:
        raise Stop('At least 4 GiB RAM is required for builds and PDF rendering.')
    if (os.cpu_count() or 0) < 2:
        raise Stop('At least two CPU cores are required.')
    if not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}', args.release):
        raise Stop('Release must be a short version or Git commit identifier.')
    if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', args.email):
        raise Stop('Supply a valid certificate contact email.')
    if not (args.source / 'compose.byoc.yaml').is_file():
        raise Stop('Source directory does not contain compose.byoc.yaml.')


def install(args):
    # DNS gate applies on every rerun, even when a previous checkpoint exists.
    preflight(args)
    if os.geteuid() != 0:
        raise Stop('Preflight passed. Run install using sudo to configure this server.')
    # Inspect every managed root before creating any of them.
    for path in (ROOT, CONFIG, ROOT / 'releases'):
        validate_chain(path, private=True)
    ensure_private_directory(CONFIG)
    with deployment_lock():
        state = load_state()
        if state.get('domain') and state['domain'] != args.domain:
            raise Stop('This server already belongs to another NIQ domain.')
        if state.get('active') and args.command == 'install' and state['active'] != args.release:
            raise Stop('Use upgrade for a different release.')
        if args.command == 'upgrade':
            if not state.get('active'):
                raise Stop('Install the application before upgrading.')
            # An operator must verify a fresh restore-tested backup before migrations.
            if not args.backup_verified:
                raise Stop('Verify a fresh backup and restore first, then pass --backup-verified.')
        if not state.get('packages'):
            if not state.get('packages_started'):
                for port in (80, 443, 3000, 8080, 5433):
                    with socket.socket() as probe:
                        if probe.connect_ex(('127.0.0.1', port)) == 0:
                            raise Stop(f'Port {port} is occupied. A dedicated fresh Ubuntu server is required.')
                state.update(packages_started=True, domain=args.domain)
                save_state(state)
            run(['apt-get', 'update'])
            run(['apt-get', 'install', '-y', *PACKAGES], env={**os.environ, 'DEBIAN_FRONTEND': 'noninteractive'})
            # Ubuntu Noble's client is PG16; match the container's PG17 for pg_dump.
            key = Path('/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc')
            key.parent.mkdir(parents=True, exist_ok=True)
            run(['curl', '--fail', '--silent', '--show-error', '-o', str(key),
                 'https://www.postgresql.org/media/keys/ACCC4CF8.asc'])
            Path('/etc/apt/sources.list.d/niq-pgdg.sources').write_text(
                'Types: deb\nURIs: https://apt.postgresql.org/pub/repos/apt\nSuites: noble-pgdg\n'
                'Components: main\nSigned-By: ' + str(key) + '\n')
            run(['apt-get', 'update'])
            run(['apt-get', 'install', '-y', 'postgresql-client-17'])
            run(['systemctl', 'enable', '--now', 'docker', 'nginx'])
            state.update(packages=True, domain=args.domain)
            save_state(state)
        init_config(args)
        envfile = CONFIG / 'byoc.env'
        settings = dict(line.split('=', 1) for line in envfile.read_text().splitlines() if '=' in line)
        source = create_release(args.source, args.release)
        compose(source, args.release, 'config', '--quiet')
        compose(source, args.release, 'build')
        check_dns(args.domain, args.server_ip)
        if not state.get('certificate'):
            conf = Path('/etc/nginx/sites-available/niq-byoc')
            if conf.exists() and not conf.read_text().startswith('# Managed by NIQ BYOC installer.'):
                raise Stop('Refusing to overwrite unmanaged nginx configuration.')
            conf.write_text(nginx_config(args.domain))
            link = Path('/etc/nginx/sites-enabled/niq-byoc')
            if not link.exists():
                link.symlink_to(conf)
            run(['nginx', '-t'])
            run(['systemctl', 'reload', 'nginx'])
            run(['certbot', '--nginx', '--non-interactive', '--agree-tos', '--redirect',
                 '--email', args.email, '-d', args.domain])
            run(['systemctl', 'enable', '--now', 'certbot.timer'])
            state['certificate'] = True
            save_state(state)
        check_dns(args.domain, args.server_ip)
        uploads = Path(settings.get('BYOC_UPLOAD_ROOT', '/var/lib/niq/report-uploads'))
        if not uploads.is_absolute() or uploads.is_symlink() or uploads == Path('/'):
            raise Stop('Upload root must be a trusted absolute directory.')
        validate_chain(uploads.parent)
        if uploads.exists() and not stat.S_ISDIR(uploads.lstat().st_mode):
            raise Stop('Upload root must be a directory.')
        uploads.mkdir(mode=0o700, parents=True, exist_ok=True)
        # Alpine adduser's first system UID/GID are 100/101, but inspect the image
        # rather than assuming a numeric account mapping for host bind mounts.
        result = subprocess.run(['docker', 'run', '--rm', '--entrypoint', 'id',
                                 f'niq-byoc-api:{args.release}', '-u'], check=True, text=True, capture_output=True)
        uid = int(result.stdout.strip())
        result = subprocess.run(['docker', 'run', '--rm', '--entrypoint', 'id',
                                 f'niq-byoc-api:{args.release}', '-g'], check=True, text=True, capture_output=True)
        os.chown(uploads, uid, int(result.stdout.strip()))
        if state.get('active'):
            # An explicit same-release rerun also shares storage with backups.
            run(['systemctl', 'stop', 'niq-byoc-backup.timer', 'niq-byoc-backup.service'])
            compose(source, args.release, 'stop', 'api', 'web')
        state['ready'] = False
        state['pending_migration'] = args.release
        save_state(state)
        # Explicit migrations on EVERY release; Compose completed service containers can be reused.
        compose(source, args.release, 'up', '-d', 'postgres')
        compose(source, args.release, 'run', '--rm', 'migrate')
        compose(source, args.release, 'up', '-d', '--wait', '--wait-timeout', '300')
        run(['curl', '--fail', '--silent', '--show-error', '--max-time', '15', f'https://{args.domain}/api/ready'])
        persist_release(args.release)
        previous = state.get('active')
        if previous != args.release:
            state['previous'] = previous
            state['active'] = args.release
        state.setdefault('schemas', {})[args.release] = schema_digest(source)
        state.pop('pending_migration', None)
        # Application readiness alone is insufficient: failed backup setup or
        # scheduling must leave installation status incomplete for a safe retry.
        save_state(state)
        current = ROOT / 'current'
        temporary = ROOT / 'current.next'
        temporary.unlink(missing_ok=True)
        temporary.symlink_to(source)
        temporary.replace(current)
        if not Path('/etc/niq-backup/config.json').exists():
            run(['python3', str(source / 'ops/backups/configure_byoc.py'), '--source', str(source),
                 '--env', str(CONFIG / 'byoc.env')])
        else:
            refresh_backup(source)
        # Schedule encrypted production backups; the restore drill remains a handover gate.
        unit = Path('/etc/systemd/system/niq-byoc-backup.service')
        unit.write_text('[Unit]\nDescription=NIQ BYOC encrypted Application backup\nAfter=docker.service network-online.target\n'
            '[Service]\nType=oneshot\nUser=root\nUMask=0077\nEnvironment=PATH=/usr/lib/postgresql/17/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin\n'
            f'ExecStart=/usr/bin/python3 {source}/ops/backups/niq_backup.py backup --config /etc/niq-backup/config.json\n'
            f'ExecStopPost=/usr/bin/python3 {source}/ops/backups/compose_writers.py recover --config /etc/niq-backup/config.json\n'
            'TimeoutStartSec=3h\nNoNewPrivileges=true\n')
        Path('/etc/systemd/system/niq-byoc-backup.timer').write_text(
            '[Unit]\nDescription=NIQ nightly backup\n[Timer]\nOnCalendar=*-*-* 02:00:00 Asia/Kolkata\n'
            'Persistent=true\nRandomizedDelaySec=120\nUnit=niq-byoc-backup.service\n[Install]\nWantedBy=timers.target\n')
        run(['systemctl', 'daemon-reload'])
        run(['systemctl', 'enable', '--now', 'niq-byoc-backup.timer'])
        state['ready'] = True
        save_state(state)
        print('Infrastructure is ready. Complete account setup at https://'  + args.domain + '/setup')
        print('Production acceptance still requires real OTP delivery, an isolated restore drill and live provider checks.')
        print('Initial setup credential is in /etc/niq/setup-token (root only). Never put it in a URL.')



def persist_release(release):
    envfile = CONFIG / 'byoc.env'
    if not validate_private_file(envfile):
        raise Stop('Private deployment configuration is missing.')
    settings = dict(line.split('=', 1) for line in envfile.read_text().splitlines() if '=' in line)
    settings['NIQ_RELEASE'] = release
    write_private(envfile, ''.join(f'{key}={value}\n' for key, value in settings.items()))


def refresh_backup(source):
    run(['python3', str(source / 'ops/backups/configure_byoc.py'), '--refresh', '--source', str(source),
         '--config-directory', '/etc/niq-backup'])


def renew_setup_key():
    if os.geteuid() != 0:
        raise Stop('Setup key renewal requires sudo.')
    with deployment_lock():
        envfile = CONFIG / 'byoc.env'
        if not validate_private_file(envfile):
            raise Stop('A private existing deployment configuration is required.')
        state = load_state()
        if state.get('pending_migration'):
            raise Stop('Finish the pending deployment before renewing the setup key.')
        settings = dict(line.split('=', 1) for line in envfile.read_text().splitlines() if '=' in line)
        settings['BYOC_SETUP_TOKEN'] = secrets.token_urlsafe(48)
        settings['BYOC_SETUP_EXPIRES_AT'] = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=24)).isoformat()
        write_private(envfile, ''.join(f'{key}={value}\n' for key, value in settings.items()))
        write_private(CONFIG / 'setup-token', settings['BYOC_SETUP_TOKEN'] + '\n')
        if state.get('active'):
            compose(ROOT / 'releases' / state['active'], state['active'],
                    'up', '-d', '--no-deps', '--force-recreate', '--wait', 'api')
        print('Setup key renewed in /etc/niq/setup-token. Completed organization setup remains closed.')


def rollback():
    if os.geteuid() != 0:
        raise Stop('Rollback requires sudo.')
    with deployment_lock():
        state = load_state()
        old, active = state.get('previous'), state.get('active')
        if state.get('pending_migration'):
            raise Stop('An upgrade migration did not finish. Inspect and restore the pre-upgrade backup before rollback.')
        if not old or state.get('schemas', {}).get(old) != state.get('schemas', {}).get(active):
            raise Stop('Automatic rollback requires identical migration history. Restore the verified pre-upgrade backup for schema changes; do not run older code against a newer schema.')
        source = ROOT / 'releases' / old
        run(['systemctl', 'stop', 'niq-byoc-backup.timer', 'niq-byoc-backup.service'])
        compose(source, old, 'stop', 'api', 'web')
        compose(source, old, 'up', '-d', '--wait', '--wait-timeout', '300', '--no-build')
        persist_release(old)
        refresh_backup(source)
        run(['systemctl', 'start', 'niq-byoc-backup.timer'])
        state.update(active=old, previous=active, ready=True)
        save_state(state)
        temporary = ROOT / 'current.next'
        temporary.unlink(missing_ok=True)
        temporary.symlink_to(source)
        temporary.replace(ROOT / 'current')
        print('Application release rolled back. Database and files were preserved.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    subs = parser.add_subparsers(dest='command', required=True)
    for action in ('preflight', 'install', 'upgrade'):
        sub = subs.add_parser(action)
        sub.add_argument('--domain', required=True)
        sub.add_argument('--server-ip', action='append', required=True, help='Repeat for every public IPv4/IPv6 DNS target')
        sub.add_argument('--email', required=True, help='Certificate contact')
        sub.add_argument('--scoring-url', required=True)
        sub.add_argument('--release', required=True)
        sub.add_argument('--source', type=Path, default=Path(__file__).resolve().parents[2])
        sub.add_argument('--backup-verified', action='store_true')
    subs.add_parser('status')
    subs.add_parser('rollback')
    subs.add_parser('renew-setup-key')
    args = parser.parse_args()
    try:
        if args.command == 'status':
            state = load_state()
            print(json.dumps({key: state.get(key) for key in ('domain', 'active', 'previous', 'packages', 'certificate', 'ready')}, indent=2))
        elif args.command == 'renew-setup-key':
            renew_setup_key()
        elif args.command == 'rollback':
            rollback()
        elif args.command == 'preflight':
            preflight(args)
            print('Preflight passed. Nothing was changed.')
        else:
            install(args)
    except (Stop, ValueError, OSError) as error:
        print(f'Stopped: {error}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
