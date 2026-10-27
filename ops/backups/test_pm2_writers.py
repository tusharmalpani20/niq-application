import json
import tempfile
from pathlib import Path
import unittest
from unittest.mock import patch
import pm2_writers as writers


class WriterTests(unittest.TestCase):
    def test_development_never_stops_writers(self):
        with patch.object(writers, 'env_file', return_value={'NODE_ENV': 'development'}), patch.object(writers, 'run') as command:
            with self.assertRaises(ValueError):
                writers.pause({'environments': {'application': 'one', 'scoring': 'two'}})
            command.assert_not_called()

    def test_active_reports_never_stop_writers(self):
        with tempfile.TemporaryDirectory() as directory:
            config = {'environments': {'application': 'one', 'scoring': 'two'}, 'writer_state_file': directory+'/state'}
            with patch.object(writers, 'env_file', return_value={'NODE_ENV': 'production', 'DATABASE_URL': 'hidden'}), patch.object(writers, 'sql', return_value='1'), patch.object(writers, 'run') as command:
                with self.assertRaises(ValueError): writers.pause(config)
                command.assert_not_called()
                self.assertFalse(Path(config['writer_state_file']).exists())

    def test_resume_only_restarts_previously_online_api(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/'state'
            name = 'niq-application-api'
            path.write_text(json.dumps([name])); path.chmod(0o600)
            with patch.object(writers, 'run', side_effect=[json.dumps([{'name': name, 'pm2_env': {'status': 'stopped'}}]).encode(), b'', json.dumps([{'name': name, 'pm2_env': {'status': 'online'}}]).encode()]) as command:
                writers.resume({'writer_state_file': str(path)})
                self.assertEqual(command.call_args_list[1].args[0], ['pm2', 'start', name])
                self.assertFalse(path.exists())

    def test_partial_stop_failure_keeps_recovery_state(self):
        with tempfile.TemporaryDirectory() as directory:
            names = sorted(writers.NAMES)
            config = {'environments': {'application': 'one', 'scoring': 'two'}, 'writer_state_file': directory+'/state'}
            processes = json.dumps([{'name': name, 'pm2_env': {'status': 'online'}} for name in names]).encode()
            with patch.object(writers, 'env_file', return_value={'NODE_ENV': 'production', 'DATABASE_URL': 'hidden'}), patch.object(writers, 'sql', return_value='0'), patch.object(writers, 'run', side_effect=[processes, RuntimeError('stop failed')]):
                with self.assertRaises(RuntimeError): writers.pause(config)
                self.assertEqual(sorted(json.loads(Path(config['writer_state_file']).read_text())), names)

class ResumeRecoveryTests(unittest.TestCase):
    def test_repeated_resume_never_restarts_an_online_api(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/'state'
            name = 'niq-application-api'
            path.write_text(json.dumps([name])); path.chmod(0o600)
            processes = json.dumps([{'name': name, 'pm2_env': {'status': 'online'}}]).encode()
            with patch.object(writers, 'run', return_value=processes) as command:
                writers.resume({'writer_state_file': str(path)})
                self.assertTrue(all(call.args[0] == ['pm2', 'jlist'] for call in command.call_args_list))
                self.assertFalse(path.exists())

if __name__ == '__main__': unittest.main()
