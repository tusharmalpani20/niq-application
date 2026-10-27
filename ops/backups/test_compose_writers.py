import json
from contextlib import contextmanager
import tempfile
from pathlib import Path
import unittest
from unittest.mock import patch
import compose_writers as writers
import niq_backup as backup


class ComposeWriterTests(unittest.TestCase):
    def config(self, root):
        file = root/'compose.yml'; file.write_text('services: {}')
        env = root/'runtime.env'; env.write_text('NODE_ENV=production\nDATABASE_URL=postgresql://fixture@127.0.0.1/test\n'); env.chmod(0o600)
        return {'environments': {'application': str(env)}, 'writer_state_file': str(root/'state'),
                'backup_root': str(root), 'compose': {'file': str(file), 'env_file': str(env), 'project_name': 'niq-client'}}

    def test_development_does_not_contact_database_or_docker(self):
        with tempfile.TemporaryDirectory() as directory:
            config = self.config(Path(directory))
            with patch.object(writers, 'env_file', return_value={'NODE_ENV':'development'}), patch.object(writers, 'admission_barrier') as fence, patch.object(writers, 'run') as command:
                with self.assertRaises(ValueError): writers.pause(config)
                command.assert_not_called(); fence.assert_not_called()

    def test_active_work_and_missing_fence_never_stop_api(self):
        with tempfile.TemporaryDirectory() as directory:
            config = self.config(Path(directory))
            @contextmanager
            def barrier(*args): yield lambda: None
            with patch.object(writers, 'admission_barrier', side_effect=barrier), patch.object(writers, 'sql', return_value='1'), patch.object(writers, 'run') as command:
                with self.assertRaises(ValueError): writers.pause(config)
                command.assert_not_called()
            with patch.object(writers, 'admission_barrier', side_effect=ValueError('busy')), patch.object(writers, 'run') as command:
                with self.assertRaises(ValueError): writers.pause(config)
                command.assert_not_called()
            self.assertFalse(Path(config['writer_state_file']).exists())

    def test_pause_fences_idle_and_stops_only_api_before_release(self):
        with tempfile.TemporaryDirectory() as directory:
            config = self.config(Path(directory)); events=[]
            @contextmanager
            def barrier(environments, tables):
                self.assertEqual(set(environments), {'application'})
                self.assertIn('assessment_initializations', tables['application'])
                events.append('fence'); yield lambda: events.append('held'); events.append('released')
            def idle(*args):
                self.assertEqual(events, ['fence']); return '0'
            def command(args):
                self.assertNotIn('released', events)
                if 'stop' in args:
                    events.append('stopped'); self.assertEqual(args[-1], 'api'); return b''
                return b'' if 'stopped' in events else b'api\n'
            with patch.object(writers, 'admission_barrier', side_effect=barrier), patch.object(writers, 'sql', side_effect=idle), patch.object(writers, 'run', side_effect=command): writers.pause(config)
            self.assertEqual(events, ['fence','held','stopped','held','released'])
            self.assertTrue(json.loads(Path(config['writer_state_file']).read_text())['api_running'])

    def test_resume_starts_only_originally_running_api_and_is_idempotent(self):
        for initially_running in (False, True):
            with self.subTest(initially_running=initially_running), tempfile.TemporaryDirectory() as directory:
                config=self.config(Path(directory)); state=Path(config['writer_state_file'])
                state.write_text(json.dumps({'format':1, 'project_name':'niq-client', 'file':config['compose']['file'], 'api_running':initially_running})); state.chmod(0o600)
                with patch.object(writers, 'running', side_effect=[False,True]), patch.object(writers, 'run', return_value=b'') as command:
                    writers.resume(config); writers.resume(config)
                    self.assertEqual(command.call_count, int(initially_running))
                    if initially_running: self.assertEqual(command.call_args.args[0][-2:], ['start','api'])
                self.assertFalse(state.exists())

    def test_partial_stop_failure_keeps_recovery_state_and_wrong_project_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            config=self.config(Path(directory))
            @contextmanager
            def barrier(*args): yield lambda: None
            with patch.object(writers, 'admission_barrier', side_effect=barrier), patch.object(writers, 'sql', return_value='0'), patch.object(writers, 'running', return_value=True), patch.object(writers, 'run', side_effect=RuntimeError('stop failed')):
                with self.assertRaises(RuntimeError): writers.pause(config)
            self.assertTrue(Path(config['writer_state_file']).exists())
            config['compose']['project_name']='another'
            with self.assertRaises(ValueError): writers.resume(config)


class ApplicationScopeTests(unittest.TestCase):
    def test_config_accepts_application_only_and_existing_combined_but_not_scoring_only(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'config'; path.chmod(0o600) if path.exists() else None
            for names, valid in ((['application'],True), (['application','scoring'],True), (['scoring'],False), ([],False)):
                path.write_text(json.dumps({'environments':dict.fromkeys(names,'fixture'), 'quiesce':['true'], 'resume':['true']})); path.chmod(0o600)
                if valid: self.assertEqual(set(backup.load_config(path)['environments']),set(names))
                else:
                    with self.assertRaises(ValueError): backup.load_config(path)

    def test_application_development_skips_before_capture(self):
        with patch.object(backup,'env_file',return_value={'NODE_ENV':'development'}), patch.object(backup,'capture') as capture:
            backup.backup({'environments':{'application':'fixture'}}); capture.assert_not_called()


class ConfigurationScaffoldingTests(unittest.TestCase):
    def test_private_configuration_uses_loopback_host_paths_and_never_overwrites_keys(self):
        import configure_byoc
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory); source=root/'release'; source.mkdir(); (source/'compose.byoc.yaml').write_text('services: {}')
            env=root/'runtime.env'; env.write_text('POSTGRES_PASSWORD=fixture-password\nSESSION_SECRET=fixture-session\nPATIENT_DATA_ENCRYPTION_KEY=fixture-key\nDB_BACKUP_PORT=5433\nBYOC_UPLOAD_ROOT=/var/lib/niq/report-uploads\n'); env.chmod(0o600)
            path=configure_byoc.configure(source,env,root/'config',root/'backups')
            config=backup.load_config(path)
            captured=backup.env_file(config['environments']['application'])
            self.assertEqual(captured['DATABASE_URL'],'postgresql://niq:fixture-password@127.0.0.1:5433/niq_application')
            self.assertEqual(captured['NODE_ENV'],'production')
            self.assertEqual(config['compose']['project_name'],'niq-byoc')
            self.assertEqual(config['verify_pdf_command'][-2:],['bun','dist/verify-pdf.js'])
            self.assertEqual(path.stat().st_mode & 0o777,0o600)
            key=Path(config['passphrase_file']).read_bytes()
            with self.assertRaises(ValueError): configure_byoc.configure(source,env,root/'config',root/'backups')
            self.assertEqual(Path(config['passphrase_file']).read_bytes(),key)


if __name__ == '__main__': unittest.main()

class ReleaseRefreshTests(unittest.TestCase):
    def test_release_refresh_preserves_secrets_and_refuses_active_recovery(self):
        import configure_byoc
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory); old=root/'old'; new=root/'new'; old.mkdir();new.mkdir()
            for source in (old,new): (source/'compose.byoc.yaml').write_text('services: {}')
            env=root/'runtime.env';env.write_text('POSTGRES_PASSWORD=fixture-password\nSESSION_SECRET=fixture-session\nPATIENT_DATA_ENCRYPTION_KEY=fixture-key\n');env.chmod(0o600)
            path=configure_byoc.configure(old,env,root/'config',root/'backups')
            before=backup.load_config(path);key=Path(before['passphrase_file']).read_bytes();appenv=Path(before['environments']['application']).read_bytes()
            configure_byoc.refresh(new,root/'config')
            after=backup.load_config(path)
            self.assertEqual(after['compose']['file'],str(new/'compose.byoc.yaml'))
            self.assertIn(str(new/'ops/backups/compose_writers.py'),after['quiesce'])
            self.assertIn(str(new/'compose.byoc.yaml'),after['verify_pdf_command'])
            self.assertEqual(Path(after['passphrase_file']).read_bytes(),key)
            self.assertEqual(Path(after['environments']['application']).read_bytes(),appenv)
            Path(after['writer_state_file']).write_text('{}')
            with self.assertRaises(ValueError): configure_byoc.refresh(old,root/'config')


class DockerEnvironmentTests(unittest.TestCase):
    def test_docker_never_inherits_release_secrets_or_endpoint_overrides(self):
        import os
        from types import SimpleNamespace
        ambient = {"PATH":"/usr/bin:/bin", "HOME":"/root", "LANG":"C.UTF-8",
                   "POSTGRES_PASSWORD":"untrusted-password", "NIQ_RELEASE":"wrong-image",
                   "DOCKER_HOST":"tcp://untrusted.example:2375", "DOCKER_CONTEXT":"remote",
                   "DOCKER_CONFIG":"/tmp/untrusted-docker", "BYOC_UPLOAD_ROOT":"/tmp/wrong-uploads"}
        with patch.dict(os.environ,ambient,clear=True), patch.object(backup.subprocess,"run",return_value=SimpleNamespace(returncode=0,stdout=b"")) as command:
            backup.run(["docker","compose","--env-file","/private/runtime.env","ps"])
            forwarded=command.call_args.kwargs["env"]
            self.assertEqual(forwarded,{"PATH":"/usr/bin:/bin","HOME":"/root","LANG":"C.UTF-8"})
            # The same path executes the restored PDF verifier with stdin secrets.
            backup.run(["docker","compose","run","--rm","-T","api","bun","dist/verify-pdf.js"], data=b"private-fixture")
            self.assertEqual(command.call_args.kwargs["env"],forwarded)
            self.assertEqual(command.call_args.kwargs["input"],b"private-fixture")

    def test_absolute_docker_path_and_explicit_environment_are_also_sanitized(self):
        from types import SimpleNamespace
        with patch.object(backup.subprocess,"run",return_value=SimpleNamespace(returncode=0,stdout=b"")) as command:
            backup.run(["/usr/bin/docker","compose","start","api"],environment={"PATH":"/usr/bin", "NIQ_RELEASE":"wrong-image", "DOCKER_HOST":"tcp://remote:2375"})
            self.assertEqual(command.call_args.kwargs["env"],{"PATH":"/usr/bin"})
            backup.run(["psql","-X"],environment={"PGPASSWORD":"private-db-password"})
            self.assertEqual(command.call_args.kwargs["env"],{"PGPASSWORD":"private-db-password"})
