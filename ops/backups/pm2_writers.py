#!/usr/bin/env python3
"""Bounded PM2 writer control for a coordinated two-database production snapshot."""
import argparse
from contextlib import contextmanager, ExitStack
import fcntl
import json
import os
from pathlib import Path
import sys
import selectors
import subprocess

from niq_backup import env_file, load_config, private_file, production, run, sql, db_env

NAMES = {'niq-application-api', 'niq-scoring-api'}


@contextmanager
def admission_barrier(environments, tables=None):
    """Hold table locks until PM2 stops, including synchronous generation runs.

    Every inference path commits an INSERT/UPDATE reservation before contacting
    its provider. SHARE prevents those writes while allowing our idle checks.
    Active reservations are detected after both databases have been fenced.
    """
    tables = tables or {'application': 'public.generated_reports',
              'scoring': 'public.report_content_jobs, public.report_generation_runs'}
    with ExitStack() as stack:
        holders = []
        for name, names in tables.items():
            process = subprocess.Popen(['psql', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1'],
                env=db_env(environments[name]['DATABASE_URL']), stdin=subprocess.PIPE,
                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)

            def release(process=process):
                try:
                    if process.poll() is None:
                        process.communicate(b'ROLLBACK;\n', timeout=5)
                except (BrokenPipeError, subprocess.TimeoutExpired):
                    process.kill()
                    process.communicate()
                finally:
                    for stream in (process.stdin, process.stdout):
                        if stream and not stream.closed:
                            stream.close()
            stack.callback(release)
            holders.append(process)
            script = ("SET lock_timeout='5s'; BEGIN; LOCK TABLE " + names
                      + " IN SHARE MODE; SELECT 'niq_admission_locked';\n")
            process.stdin.write(script.encode())
            process.stdin.flush()
            with selectors.DefaultSelector() as ready:
                ready.register(process.stdout, selectors.EVENT_READ)
                if not ready.select(timeout=10) or process.stdout.readline().strip() != b'niq_admission_locked':
                    raise ValueError('Could not establish report admission barrier')
        def ensure_held():
            if any(process.poll() is not None for process in holders):
                raise ValueError('Report admission barrier was lost')
        ensure_held()
        yield ensure_held
        ensure_held()


def recover(config, resume_writer=None):
    """External termination recovery must never resume another capture's writers."""
    root = Path(config['backup_root'])
    if not root.exists():
        return
    if not root.is_absolute() or root.is_symlink() or root.stat().st_mode & 0o077:
        raise ValueError('Recovery requires a private backup directory')
    with (root / '.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print('Writer recovery skipped: another backup capture owns the lock')
            return
        (resume_writer or resume)(config)


def pause(config):
    environments = {key: env_file(path) for key, path in config['environments'].items()}
    if not production(environments.values()):
        raise ValueError('Writer pause is restricted to production backups')
    state = Path(config['writer_state_file'])
    if not state.is_absolute() or state.exists() or state.is_symlink():
        raise ValueError('Review existing writer recovery state before pausing again')
    if state.parent.stat().st_mode & 0o077:
        raise ValueError('Writer state parent must be private')
    with admission_barrier(environments) as ensure_held:
        # Do not interrupt a paid agent run or a report waiting for its PDF.
        checks = {
            'application': "SELECT count(*) FROM generated_reports WHERE status IN ('QUEUED','GENERATING') OR lease_token IS NOT NULL OR (next_attempt_at IS NOT NULL AND status IN ('DRAFT','FAILED'));",
            'scoring': "SELECT (SELECT count(*) FROM report_content_jobs WHERE status IN ('QUEUED','PROCESSING','REVIEW_REQUIRED')) + (SELECT count(*) FROM report_generation_runs WHERE status='PROCESSING');",
        }
        if any(sql(environments[key]['DATABASE_URL'], statement) != '0' for key, statement in checks.items()):
            raise ValueError('Backup postponed: report work is active or queued')
        processes = json.loads(run(['pm2', 'jlist']))
        selected = [item['name'] for item in processes if item.get('name') in NAMES and item['pm2_env']['status'] == 'online']
        if {item['name'] for item in processes if item.get('name') in NAMES} != NAMES:
            raise ValueError('Both expected NIQ API processes must be registered')
        # Record before stopping so resume handles partial PM2 failure safely.
        with state.open('x') as target:
            os.chmod(state, 0o600)
            json.dump(selected, target)
        ensure_held()
        if selected:
            run(['pm2', 'stop', *selected])
        ensure_held()
        stopped = json.loads(run(['pm2', 'jlist']))
        if any(item['name'] in NAMES and item['pm2_env']['status'] != 'stopped' for item in stopped):
            raise ValueError('Writer processes did not all stop')
    print('NIQ writers paused for a consistent snapshot')


def resume(config):
    state = Path(config['writer_state_file'])
    if not state.exists():
        return
    names = json.loads(private_file(state).read_text())
    if not isinstance(names, list) or any(name not in NAMES for name in names) or len(names) != len(set(names)):
        raise ValueError('Invalid writer recovery state')
    if names:
        current = json.loads(run(['pm2', 'jlist']))
        online = {item['name'] for item in current if item['name'] in names and item['pm2_env']['status'] == 'online'}
        pending = [name for name in names if name not in online]
        if pending:
            run(['pm2', 'start', *pending])
        processes = json.loads(run(['pm2', 'jlist']))
        if {item['name'] for item in processes if item['name'] in names and item['pm2_env']['status'] == 'online'} != set(names):
            raise ValueError('Writer recovery is incomplete')
    state.unlink()
    print('Previously running NIQ writers resumed')


if __name__ == '__main__':
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['pause', 'resume', 'recover'])
    parser.add_argument('--config', required=True)
    args = parser.parse_args()
    try:
        config = load_config(args.config)
        {'pause': pause, 'resume': resume, 'recover': recover}[args.action](config)
    except Exception:
        print('NIQ writer control failed; review its private recovery state', file=sys.stderr)
        sys.exit(1)
