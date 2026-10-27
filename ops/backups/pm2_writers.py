#!/usr/bin/env python3
"""Bounded PM2 writer control for a coordinated two-database production snapshot."""
import argparse
import json
import os
from pathlib import Path
import sys

from niq_backup import env_file, load_config, private_file, production, run, sql

NAMES = {'niq-application-api', 'niq-scoring-api'}


def pause(config):
    environments = {key: env_file(path) for key, path in config['environments'].items()}
    if not production(environments.values()):
        raise ValueError('Writer pause is restricted to production backups')
    state = Path(config['writer_state_file'])
    if not state.is_absolute() or state.exists() or state.is_symlink():
        raise ValueError('Review existing writer recovery state before pausing again')
    if state.parent.stat().st_mode & 0o077:
        raise ValueError('Writer state parent must be private')
    # Do not interrupt a paid agent run or a report waiting for its PDF.
    checks = {
        'application': "SELECT count(*) FROM generated_reports WHERE status IN ('QUEUED','GENERATING') OR lease_token IS NOT NULL OR (next_attempt_at IS NOT NULL AND status IN ('DRAFT','FAILED'));",
        'scoring': "SELECT count(*) FROM report_content_jobs WHERE status IN ('QUEUED','PROCESSING','REVIEW_REQUIRED');",
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
    if selected:
        run(['pm2', 'stop', *selected])
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
    parser.add_argument('action', choices=['pause', 'resume'])
    parser.add_argument('--config', required=True)
    args = parser.parse_args()
    try:
        config = load_config(args.config)
        (pause if args.action == 'pause' else resume)(config)
    except Exception:
        print('NIQ writer control failed; review its private recovery state', file=sys.stderr)
        sys.exit(1)
