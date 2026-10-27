#!/usr/bin/env python3
"""Host-side writer control for an Application-only Docker Compose backup."""
import argparse
import json
import os
from pathlib import Path
import sys

from niq_backup import env_file, load_config, private_file, production, run, sql
from pm2_writers import admission_barrier, recover as recover_with_lock

# Fence admissions before checking idle; otherwise a request could start between
# SELECT and container stop. Include outbound scoring, scans and file reservations.
TABLES = {'application': 'public.generated_reports, public.assessment_initializations, '
          'public.assessment_submissions, public.scoring_requests, public.face_scan_sessions, '
          'public.assessment_files'}
IDLE = """SELECT
 (SELECT count(*) FROM generated_reports WHERE status IN ('QUEUED','GENERATING') OR lease_token IS NOT NULL OR (next_attempt_at IS NOT NULL AND status IN ('DRAFT','FAILED')))
 + (SELECT count(*) FROM assessment_initializations WHERE status='PENDING' OR lease_token IS NOT NULL)
 + (SELECT count(*) FROM assessment_submissions WHERE status='PENDING' OR lease_token IS NOT NULL)
 + (SELECT count(*) FROM scoring_requests WHERE status='PENDING')
 + (SELECT count(*) FROM face_scan_sessions WHERE status IN ('REQUESTED','IN_PROGRESS'))
 + (SELECT count(*) FROM assessment_files WHERE status='PENDING' OR lease_token IS NOT NULL);"""


def compose(config):
    options = config['compose']
    # Trusted operator paths only; no shell expansion or arbitrary service names.
    project = options['project_name']
    import re
    if not re.fullmatch(r'[a-z0-9][a-z0-9_-]*', project):
        raise ValueError('Invalid Compose project name')
    file = Path(options['file'])
    if not file.is_absolute() or file.is_symlink() or not file.is_file():
        raise ValueError('Compose file must be an absolute regular file')
    environment = private_file(options['env_file'])
    return ['docker', 'compose', '--project-name', project, '--env-file', str(environment), '-f', str(file)]


def running(config):
    return run([*compose(config), 'ps', '--status', 'running', '--services', 'api']).decode().splitlines() == ['api']


def pause(config):
    if set(config['environments']) != {'application'}:
        raise ValueError('Compose backup supports Application-only installations')
    environments = {'application': env_file(config['environments']['application'])}
    if not production(environments.values()):
        raise ValueError('Writer pause is restricted to production backups')
    state = Path(config['writer_state_file'])
    if not state.is_absolute() or state.exists() or state.is_symlink() or state.parent.stat().st_mode & 0o077:
        raise ValueError('Review private writer recovery state before pausing')
    with admission_barrier(environments, TABLES) as ensure_held:
        if sql(environments['application']['DATABASE_URL'], IDLE) != '0':
            raise ValueError('Backup postponed: application work is active or queued')
        was_running = running(config)
        # Persist before stop so partial command failure can be recovered safely.
        with state.open('x') as target:
            os.chmod(state, 0o600)
            json.dump({'format': 1, 'project_name': config['compose']['project_name'],
                       'file': str(Path(config['compose']['file']).resolve()), 'api_running': was_running}, target)
        ensure_held()
        if was_running:
            run([*compose(config), 'stop', '--timeout', '60', 'api'])
        ensure_held()
        if running(config):
            raise ValueError('Application writer did not stop')
    print('Application writer paused for snapshot')


def resume(config):
    state = Path(config['writer_state_file'])
    if not state.exists():
        return
    record = json.loads(private_file(state).read_text())
    expected = {'format': 1, 'project_name': config['compose']['project_name'],
                'file': str(Path(config['compose']['file']).resolve())}
    if not isinstance(record, dict) or any(record.get(key) != value for key, value in expected.items()) or type(record.get('api_running')) is not bool:
        raise ValueError('Recovery state belongs to another Compose deployment')
    if record['api_running'] and not running(config):
        run([*compose(config), 'start', 'api'])
        if not running(config):
            raise ValueError('Application writer recovery incomplete')
    state.unlink()
    print('Previously running Application writer recovered')


def recover(config):
    # Reuse the same capture lock. Recovery must not unpause an active capture.
    recover_with_lock(config, resume_writer=resume)


if __name__ == '__main__':
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['pause', 'resume', 'recover'])
    parser.add_argument('--config', required=True)
    args = parser.parse_args()
    try:
        {'pause': pause, 'resume': resume, 'recover': recover}[args.action](load_config(args.config))
    except Exception:
        print('Compose writer control failed; inspect private recovery state', file=sys.stderr)
        sys.exit(1)
