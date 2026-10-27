#!/usr/bin/env python3
"""Create private Application-only backup configuration; never touch a database."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import secrets

from niq_backup import env_file, load_config


def private_write(path, content):
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, 'w') as target:
        target.write(content)


def configure(source, runtime_env, config_directory, backup_root):
    source, runtime_env = Path(source), Path(runtime_env)
    directory, root = Path(config_directory), Path(backup_root)
    for path in (source, runtime_env, directory, root):
        if not path.is_absolute() or path.is_symlink():
            raise ValueError('Absolute trusted paths required')
    settings = env_file(runtime_env)
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    if directory.stat().st_mode & 0o077 or root.stat().st_mode & 0o077:
        raise ValueError('Backup configuration and storage directories must be private')
    config_path = directory/'config.json'
    if config_path.exists():
        raise ValueError('Backup configuration already exists; retain recovery secrets and review configuration')
    # Both runtime and Compose currently fix production; the backup never changes it.
    port = int(settings.get('DB_BACKUP_PORT', '5433'))
    if not 1 <= port <= 65535:
        raise ValueError('Invalid loopback database port')
    from urllib.parse import quote
    backup_env = directory/'application.env'
    content = {'NODE_ENV': 'production',
               'DATABASE_URL': f"postgresql://niq:{quote(settings['POSTGRES_PASSWORD'], safe='')}@127.0.0.1:{port}/niq_application",
               'REPORT_UPLOAD_ROOT': settings.get('BYOC_UPLOAD_ROOT', '/var/lib/niq/report-uploads'),
               'SESSION_SECRET': settings['SESSION_SECRET'],
               'PATIENT_DATA_ENCRYPTION_KEY': settings['PATIENT_DATA_ENCRYPTION_KEY']}
    command = ['docker','compose','--project-name','niq-byoc','--env-file',str(runtime_env),'-f',str(source/'compose.byoc.yaml')]
    config = {'environments': {'application': str(backup_env)}, 'backup_root': str(root),
              'passphrase_file': str(directory/'recovery-passphrase'),
              'restore_test_env': str(directory/'restore-test.env'), 'writer_state_file': str(directory/'writers.json'),
              'compose': {'project_name':'niq-byoc','file':str(source/'compose.byoc.yaml'),'env_file':str(runtime_env)},
              'server_files': [str(runtime_env),str(source/'compose.byoc.yaml')],
              'verify_pdf_command': [*command,'run','--rm','--no-deps','-T','api','bun','dist/verify-pdf.js']}
    for action, field in (('pause','quiesce'),('resume','resume')):
        config[field] = ['/usr/bin/python3',str(source/'ops/backups/compose_writers.py'),action,'--config',str(config_path)]
    if settings.get('SENTRY_OPERATIONS_DSN'):
        config['sentry_dsn'] = settings['SENTRY_OPERATIONS_DSN']
    # Preserve an independent passphrase on partial retry, never rotate implicitly.
    if not (directory/'recovery-passphrase').exists():
        private_write(directory/'recovery-passphrase', secrets.token_hex(48)+'\n')
    if backup_env.exists() and env_file(backup_env) != content:
        raise ValueError('Existing partial backup environment differs from runtime; review before continuing')
    if not backup_env.exists():
        private_write(backup_env, ''.join(f'{key}={json.dumps(value)}\n' for key,value in content.items()))
    private_write(config_path,json.dumps(config,indent=2)+'\n')
    return config_path


def refresh(source, config_directory):
    """Advance generated command paths after a verified release, retaining secrets."""
    source, directory = Path(source), Path(config_directory)
    if not source.is_absolute() or source.is_symlink() or not (source/'compose.byoc.yaml').is_file():
        raise ValueError('Use the actual new release directory')
    config_path = directory/'config.json'
    config = load_config(config_path)
    if set(config['environments']) != {'application'} or config.get('compose', {}).get('project_name') != 'niq-byoc':
        raise ValueError('Only generated Application BYOC configuration can be refreshed')
    state = Path(config['writer_state_file'])
    if state.exists() or state.is_symlink():
        raise ValueError('Recover paused writers before refreshing configuration')
    old_file = Path(config['compose']['file'])
    old_source = old_file.parent
    for action, field in (('pause','quiesce'),('resume','resume')):
        expected = ['/usr/bin/python3',str(old_source/'ops/backups/compose_writers.py'),action,'--config',str(config_path)]
        if config[field] != expected:
            raise ValueError('Custom writer commands need manual review')
        config[field][1] = str(source/'ops/backups/compose_writers.py')
    verifier = config.get('verify_pdf_command', [])
    if len(verifier) != 15 or verifier[:6] != ['docker','compose','--project-name','niq-byoc','--env-file',config['compose']['env_file']] or verifier[6:8] != ['-f',str(old_file)] or verifier[8:] != ['run','--rm','--no-deps','-T','api','bun','dist/verify-pdf.js']:
        raise ValueError('Custom PDF verifier needs manual review')
    verifier[7] = str(source/'compose.byoc.yaml')
    config['compose']['file'] = str(source/'compose.byoc.yaml')
    config['server_files'] = [str(source/Path(path).relative_to(old_source)) if Path(path).is_relative_to(old_source) else path
                              for path in config.get('server_files', [])]
    temporary = directory/'config.refresh.json'
    with (Path(config['backup_root'])/'.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX | fcntl.LOCK_NB)
        if state.exists() or state.is_symlink():
            raise ValueError('Recover paused writers before refreshing configuration')
        private_write(temporary,json.dumps(config,indent=2)+'\n')
        os.replace(temporary,config_path)
    return config_path


if __name__ == '__main__':
    os.umask(0o077)
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source',required=True); parser.add_argument('--env')
    parser.add_argument('--refresh',action='store_true')
    parser.add_argument('--config-directory',default='/etc/niq-backup'); parser.add_argument('--backup-root',default='/var/backups/niq')
    args=parser.parse_args()
    try:
        if args.refresh:
            refresh(args.source,args.config_directory)
        elif args.env:
            configure(args.source,args.env,args.config_directory,args.backup_root)
        else:
            raise ValueError('Initial configuration requires --env')
        print('Private Application backup configuration created; provision isolated restore credentials before the restore drill')
    except Exception:
        print('Backup configuration failed; inspect private configuration without exposing secrets')
        raise SystemExit(1)
