"""Safe installer acceptance: all host/network mutations are replaced by test doubles."""
import argparse
import importlib.util
import json
from pathlib import Path
import socket
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('byoc_install', Path(__file__).with_name('install.py'))
installer = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(installer)


class PreflightTests(unittest.TestCase):
    def test_domain_refuses_injection_urls_and_addresses(self):
        for value in ('http://niq.example.com', '127.0.0.1', 'niq.example.com;id', '*.example.com', 'example.com/path', 'a\n.example.com'):
            with self.subTest(value=value), self.assertRaises(installer.Stop):
                installer.validate_domain(value)
        self.assertEqual(installer.validate_domain('NIQ.Example.COM.'), 'niq.example.com')

    def test_dns_refuses_missing_wrong_or_unexpected_ipv6(self):
        for answers in ([], [(None, None, None, None, ('8.8.4.4', 443))],
                        [(None, None, None, None, ('8.8.8.8', 443)), (None, None, None, None, ('2606:4700:4700::1111', 443))]):
            with self.assertRaises(installer.Stop):
                installer.check_dns('niq.example.com', ['8.8.8.8'], lambda *a, **k: answers)
        with self.assertRaises(installer.Stop):
            installer.check_dns('niq.example.com', ['8.8.8.8'], lambda *a, **k: (_ for _ in ()).throw(socket.gaierror()))

    def test_dns_accepts_only_the_supplied_public_targets(self):
        answers = [(None, None, None, None, ('8.8.8.8', 443))]
        self.assertEqual(installer.check_dns('niq.example.com', ['8.8.8.8'], lambda *a, **k: answers), ['8.8.8.8'])
        with self.assertRaises(installer.Stop):
            installer.check_dns('niq.example.com', ['127.0.0.1'], lambda *a, **k: answers)

    def test_only_ubuntu_24_04(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'os-release'
            for content in ('ID=debian\nVERSION_ID="24.04"', 'ID=ubuntu\nVERSION_ID="22.04"'):
                path.write_text(content)
                with self.assertRaises(installer.Stop):
                    installer.check_ubuntu(path)
            path.write_text('ID=ubuntu\nVERSION_ID="24.04"')
            installer.check_ubuntu(path)

    def test_scoring_requires_https_without_embedded_secrets(self):
        for url in ('http://scoring.example.com', 'https://key@scoring.example.com', 'https://scoring.example.com?key=secret'):
            with self.assertRaises(installer.Stop):
                installer.validate_scoring(url)
        self.assertEqual(installer.validate_scoring('https://scoring.example.com/'), 'https://scoring.example.com')

    def test_scoring_url_cannot_inject_environment_lines_or_invalid_ports(self):
        for url in ('https://scoring.example.com/api\nFACE_SCAN_ENABLED=true',
                    'https://scoring.example.com/a\rpath', 'https://scoring.example.com/a\tpath',
                    'https://scoring.example.com:invalid/api', 'https://scoring.example.com:99999/api'):
            with self.subTest(url=url), self.assertRaises(installer.Stop):
                installer.validate_scoring(url)

    def test_dns_failure_has_no_privileged_effects(self):
        args = argparse.Namespace(domain='niq.example.com', server_ip=['8.8.8.8'], scoring_url='https://scoring.example.com')
        with patch.object(installer, 'check_ubuntu'), patch.object(installer, 'check_dns', side_effect=installer.Stop('DNS')), patch.object(installer, 'run') as run:
            with self.assertRaises(installer.Stop):
                installer.install(args)
            run.assert_not_called()


class StateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.root = root / 'opt'
        self.config = root / 'etc'
        self.root.mkdir(mode=0o700)
        for name, value in [('ROOT', self.root), ('CONFIG', self.config), ('TRUST_BOUNDARY', root), ('TRUSTED_UID', installer.os.getuid())]:
            p = patch.object(installer, name, value)
            p.start()
            self.addCleanup(p.stop)
        self.args = argparse.Namespace(domain='niq.example.com', scoring_url='https://scoring.example.com', release='test123', server_ip=['8.8.8.8'])

    def test_resuming_does_not_rotate_encryption_or_setup_keys(self):
        installer.init_config(self.args)
        before = (self.config / 'byoc.env').read_bytes()
        token = (self.config / 'setup-token').read_text()
        installer.init_config(self.args)
        self.assertEqual(before, (self.config / 'byoc.env').read_bytes())
        self.assertIn(token.strip(), before.decode())
        self.assertEqual((self.config / 'byoc.env').stat().st_mode & 0o777, 0o600)
        self.args.domain = 'other.example.com'
        with self.assertRaises(installer.Stop):
            installer.init_config(self.args)

    def test_disabled_setup_stays_disabled_on_upgrade(self):
        installer.init_config(self.args)
        envfile = self.config / 'byoc.env'
        settings = dict(line.split('=', 1) for line in envfile.read_text().splitlines())
        settings['BYOC_SETUP_TOKEN'] = ''
        settings['BYOC_SETUP_EXPIRES_AT'] = ''
        installer.write_private(envfile, ''.join(f'{key}={value}\n' for key, value in settings.items()))
        (self.config / 'setup-token').unlink()
        installer.init_config(self.args)
        self.assertFalse((self.config / 'setup-token').exists())

    def test_crash_after_environment_write_recreates_missing_setup_file(self):
        installer.init_config(self.args)
        before = (self.config / 'byoc.env').read_bytes()
        (self.config / 'setup-token').unlink()
        installer.init_config(self.args)
        self.assertEqual(before, (self.config / 'byoc.env').read_bytes())
        settings = dict(line.split('=', 1) for line in before.decode().splitlines())
        self.assertEqual((self.config / 'setup-token').read_text().strip(), settings['BYOC_SETUP_TOKEN'])

    def test_compose_ignores_ambient_credentials_and_uses_private_env(self):
        with patch.dict(installer.os.environ, {'POSTGRES_PASSWORD': 'wrong', 'AUTH_MODE': 'disabled',
                                              'DOCKER_HOST': 'tcp://untrusted:2375', 'NIQ_RELEASE': 'ambient'}), patch.object(installer, 'run') as run:
            installer.compose(self.root, 'desired', 'config', '--quiet')
        env = run.call_args.kwargs['env']
        for name in ('POSTGRES_PASSWORD', 'AUTH_MODE', 'DOCKER_HOST'):
            self.assertNotIn(name, env)
        self.assertEqual(env['NIQ_RELEASE'], 'desired')
        self.assertIn(str(self.config / 'byoc.env'), run.call_args.args[0])

    def test_failed_build_does_not_change_active_backup_release(self):
        installer.init_config(self.args)
        before = (self.config / 'byoc.env').read_bytes()
        installer.save_state({'active': 'test123', 'domain': self.args.domain, 'packages': True, 'certificate': True})
        self.args.command, self.args.backup_verified, self.args.release, self.args.source = 'upgrade', True, 'next', self.root
        def compose(*args):
            if args[-1] == 'build':
                raise installer.Stop('build failed')
        with patch.object(installer, 'preflight'), patch.object(installer.os, 'geteuid', return_value=0), patch.object(installer, 'create_release', return_value=self.root), patch.object(installer, 'compose', side_effect=compose):
            with self.assertRaises(installer.Stop):
                installer.install(self.args)
        self.assertEqual(before, (self.config / 'byoc.env').read_bytes())
        self.assertEqual(installer.load_state()['active'], 'test123')

    def test_failed_readiness_retains_old_release_and_blocks_rollback(self):
        installer.init_config(self.args)
        settings = (self.config / 'byoc.env').read_text().replace('/var/lib/niq/report-uploads', str(self.root / 'uploads'))
        installer.write_private(self.config / 'byoc.env', settings)
        installer.save_state({'active': 'test123', 'domain': self.args.domain, 'packages': True, 'certificate': True})
        self.args.command, self.args.backup_verified, self.args.release, self.args.source = 'upgrade', True, 'next', self.root
        def run(args, **kwargs):
            if args[0] == 'curl':
                raise installer.Stop('readiness failed')
        result = argparse.Namespace(stdout='100\n')
        with patch.object(installer, 'preflight'), patch.object(installer, 'check_dns'), patch.object(installer.os, 'geteuid', return_value=0), patch.object(installer, 'create_release', return_value=self.root), patch.object(installer, 'compose'), patch.object(installer, 'run', side_effect=run), patch.object(installer.subprocess, 'run', return_value=result), patch.object(installer.os, 'chown'):
            with self.assertRaises(installer.Stop):
                installer.install(self.args)
        self.assertEqual(settings, (self.config / 'byoc.env').read_text())
        self.assertEqual(installer.load_state()['pending_migration'], 'next')

    def test_failed_backup_setup_never_reports_installation_ready(self):
        installer.init_config(self.args)
        envfile = self.config / 'byoc.env'
        installer.write_private(envfile, envfile.read_text().replace('/var/lib/niq/report-uploads', str(self.root / 'uploads')))
        installer.save_state({'active': 'test123', 'domain': self.args.domain, 'packages': True, 'certificate': True})
        self.args.command, self.args.backup_verified, self.args.release, self.args.source = 'upgrade', True, 'next', self.root
        exists = Path.exists
        def backup_exists(path):
            return True if str(path) == '/etc/niq-backup/config.json' else exists(path)
        with patch.object(installer, 'preflight'), patch.object(installer, 'check_dns'), \
                patch.object(installer.os, 'geteuid', return_value=0), \
                patch.object(installer, 'create_release', return_value=self.root), \
                patch.object(installer, 'compose'), patch.object(installer, 'run'), \
                patch.object(installer.subprocess, 'run', return_value=argparse.Namespace(stdout='100\n')), \
                patch.object(installer.os, 'chown'), patch.object(Path, 'exists', backup_exists), \
                patch.object(installer, 'refresh_backup', side_effect=installer.Stop('backup setup failed')):
            with self.assertRaisesRegex(installer.Stop, 'backup setup failed'):
                installer.install(self.args)
        self.assertFalse(installer.load_state()['ready'])

    def test_renewal_changes_only_setup_keys_and_restarts_only_api(self):
        installer.init_config(self.args)
        before = dict(line.split('=', 1) for line in (self.config / 'byoc.env').read_text().splitlines())
        installer.save_state({'active': 'test123'})
        with patch.object(installer.os, 'geteuid', return_value=0), patch.object(installer, 'compose') as compose:
            installer.renew_setup_key()
        after = dict(line.split('=', 1) for line in (self.config / 'byoc.env').read_text().splitlines())
        self.assertNotEqual(before['BYOC_SETUP_TOKEN'], after['BYOC_SETUP_TOKEN'])
        for key in ('POSTGRES_PASSWORD', 'APP_DATABASE_PASSWORD', 'PATIENT_DATA_ENCRYPTION_KEY', 'SCORING_CREDENTIAL_ENCRYPTION_KEY', 'SESSION_SECRET'):
            self.assertEqual(before[key], after[key])
        self.assertEqual(compose.call_args.args[-1], 'api')
        self.assertIn('--no-deps', compose.call_args.args)
        self.assertEqual((self.config / 'setup-token').read_text().strip(), after['BYOC_SETUP_TOKEN'])

    def test_untrusted_config_directory_stops_before_private_write(self):
        self.config.mkdir(mode=0o750)
        with self.assertRaises(installer.Stop):
            installer.init_config(self.args)
        self.assertEqual(list(self.config.iterdir()), [])
        self.config.chmod(0o700)
        with patch.object(installer, 'TRUSTED_UID', installer.os.getuid() + 1):
            with self.assertRaises(installer.Stop):
                installer.init_config(self.args)
        self.assertEqual(list(self.config.iterdir()), [])

    def test_symlinked_config_or_parent_is_not_followed(self):
        target = self.root / 'target'
        target.mkdir(mode=0o700)
        self.config.symlink_to(target, target_is_directory=True)
        with self.assertRaises(installer.Stop):
            installer.init_config(self.args)
        self.assertEqual(list(target.iterdir()), [])
        with self.assertRaises(installer.Stop):
            installer.write_private(self.config / 'nested' / 'key', 'secret')
        self.assertEqual(list(target.iterdir()), [])

    def test_symlinked_or_public_lock_cannot_truncate_target(self):
        target = self.root / 'target'
        installer.write_private(target, 'keep')
        lock = self.root / 'installer.lock'
        lock.symlink_to(target)
        with self.assertRaises(installer.Stop):
            with installer.deployment_lock():
                self.fail('lock acquired through symlink')
        self.assertEqual(target.read_text(), 'keep')
        lock.unlink()
        lock.write_text('keep')
        lock.chmod(0o644)
        with self.assertRaises(installer.Stop):
            with installer.deployment_lock():
                self.fail('public lock acquired')
        self.assertEqual(lock.read_text(), 'keep')

    def test_lock_is_created_private_with_no_follow(self):
        real_open = installer.os.open
        with patch.object(installer.os, 'open', wraps=real_open) as opened:
            with installer.deployment_lock():
                self.assertEqual((self.root / 'installer.lock').stat().st_mode & 0o777, 0o600)
        self.assertTrue(opened.call_args.args[1] & installer.os.O_NOFOLLOW)

    def test_untrusted_existing_root_refuses_install_before_config_creation(self):
        self.root.chmod(0o755)
        self.args.command = 'install'
        with patch.object(installer, 'preflight'), patch.object(installer.os, 'geteuid', return_value=0), patch.object(installer, 'run') as run:
            with self.assertRaises(installer.Stop):
                installer.install(self.args)
        self.assertFalse(self.config.exists())
        run.assert_not_called()

    def test_runtime_database_password_added_once_for_existing_configuration(self):
        installer.init_config(self.args)
        envfile = self.config / 'byoc.env'
        settings = dict(line.split('=', 1) for line in envfile.read_text().splitlines())
        del settings['APP_DATABASE_PASSWORD']
        installer.write_private(envfile, ''.join(f'{key}={value}\n' for key, value in settings.items()))
        installer.init_config(self.args)
        once = envfile.read_text()
        installer.init_config(self.args)
        self.assertEqual(once, envfile.read_text())
        generated = dict(line.split('=', 1) for line in once.splitlines())
        self.assertEqual(len(generated['APP_DATABASE_PASSWORD']), 64)
        self.assertEqual(settings['POSTGRES_PASSWORD'], generated['POSTGRES_PASSWORD'])

    def test_dns_drift_after_build_stops_before_certificate_or_launch(self):
        installer.init_config(self.args)
        installer.save_state({'domain': self.args.domain, 'packages': True})
        self.args.command, self.args.backup_verified, self.args.source = 'install', False, self.root
        with patch.object(installer, 'preflight'), patch.object(installer.os, 'geteuid', return_value=0), patch.object(installer, 'create_release', return_value=self.root), patch.object(installer, 'compose') as compose, patch.object(installer, 'check_dns', side_effect=installer.Stop('DNS drift')), patch.object(installer, 'run') as run:
            with self.assertRaises(installer.Stop):
                installer.install(self.args)
        self.assertEqual([call.args[-1] for call in compose.call_args_list], ['--quiet', 'build'])
        run.assert_not_called()

    def test_dns_drift_before_upgrade_keeps_existing_writers_running(self):
        installer.init_config(self.args)
        installer.save_state({'domain': self.args.domain, 'active': 'test123', 'packages': True, 'certificate': True})
        self.args.command, self.args.backup_verified, self.args.release, self.args.source = 'upgrade', True, 'next', self.root
        result = argparse.Namespace(stdout='100\n')
        with patch.object(installer, 'preflight'), patch.object(installer.os, 'geteuid', return_value=0), patch.object(installer, 'create_release', return_value=self.root), patch.object(installer, 'compose') as compose, patch.object(installer, 'check_dns', side_effect=[None, installer.Stop('DNS drift')]), patch.object(installer.subprocess, 'run', return_value=result), patch.object(installer.os, 'chown'), patch.object(installer, 'run') as run:
            with self.assertRaises(installer.Stop):
                installer.install(self.args)
        self.assertEqual([call.args[-1] for call in compose.call_args_list], ['--quiet', 'build'])
        run.assert_not_called()
        self.assertEqual(installer.load_state()['active'], 'test123')

    def test_private_write_refuses_symlinks(self):
        victim = self.root / 'victim'
        victim.write_text('keep')
        symlink = self.root / 'symlink'
        symlink.symlink_to(victim)
        with self.assertRaises(installer.Stop):
            installer.write_private(symlink, 'replace')
        self.assertEqual(victim.read_text(), 'keep')

    def test_schema_changing_or_incomplete_upgrade_cannot_rollback(self):
        for state in ({'active': 'new', 'previous': 'old', 'schemas': {'new': 'a', 'old': 'b'}},
                      {'active': 'old', 'pending_migration': 'new', 'previous': 'older', 'schemas': {'old': 'a', 'older': 'a'}}):
            installer.save_state(state)
            with patch.object(installer.os, 'geteuid', return_value=0), patch.object(installer, 'compose') as compose:
                with self.assertRaises(installer.Stop):
                    installer.rollback()
                compose.assert_not_called()

    def test_same_schema_rollback_preserves_data_and_changes_release(self):
        installer.save_state({'active': 'new', 'previous': 'old', 'schemas': {'new': 'a', 'old': 'a'}})
        installer.init_config(self.args)
        with patch.object(installer.os, 'geteuid', return_value=0), patch.object(installer, 'run'), patch.object(installer, 'compose') as compose:
            installer.rollback()
            arguments = compose.call_args.args
            self.assertIn('--no-build', arguments)
            self.assertNotIn('down', arguments)
            self.assertEqual(installer.load_state()['active'], 'old')
            self.assertTrue(installer.load_state()['ready'])
            self.assertEqual((self.root / 'current').readlink(), self.root / 'releases' / 'old')

    def test_upgrade_requires_backup_confirmation_before_any_host_command(self):
        installer.save_state({'active': 'old', 'domain': 'niq.example.com'})
        self.args.command, self.args.backup_verified = 'upgrade', False
        with patch.object(installer, 'preflight'), patch.object(installer.os, 'geteuid', return_value=0), patch.object(installer, 'run') as run:
            with self.assertRaises(installer.Stop):
                installer.install(self.args)
            run.assert_not_called()

    def test_nginx_does_not_forward_api_through_insecure_inner_proxy(self):
        conf = installer.nginx_config('niq.example.com')
        self.assertIn('proxy_pass http://127.0.0.1:3000/', conf)
        self.assertIn('X-Forwarded-Proto $scheme', conf)
        self.assertIn('proxy_buffering off', conf)
        self.assertIn('listen [::]:80', conf)


if __name__ == '__main__':
    unittest.main()
