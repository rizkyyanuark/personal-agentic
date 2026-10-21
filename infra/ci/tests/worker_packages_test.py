import importlib.util
import pathlib
import tempfile
import unittest
import zipfile

source = pathlib.Path(__file__).resolve().parents[1] / 'worker_packages.py'
spec = importlib.util.spec_from_file_location('worker_packages', source)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class Packages(unittest.TestCase):
    def test_reproducible_archive_and_wrong_architecture(self):
        # Header fixtures exercise the package contract, never claim executable smoke proof.
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            binary = root / 'input'
            header = bytearray(64)
            header[:6] = b'\x7fELF\x02\x01'
            header[18:20] = (183).to_bytes(2, 'little')
            binary.write_bytes(header)
            first = module.package(binary, 'linux-arm64', 'a' * 40, root / 'one', [])
            second = module.package(binary, 'linux-arm64', 'a' * 40, root / 'two', [])
            self.assertEqual(first, second)
            with zipfile.ZipFile(root / 'one' / first['file']) as archive:
                self.assertEqual(archive.namelist(), ['agentic-enterprise'])
                self.assertEqual(archive.read('agentic-enterprise'), header)
            with self.assertRaises(ValueError):
                module.package(binary, 'windows-x64', 'a' * 40, root / 'wrong', [])
            with self.assertRaises(ValueError):
                module.package(binary, 'linux-arm64', '../../escape', root / 'wrong', [])

    def test_windows_library_names_and_case_duplicates_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            pe = bytearray(80)
            pe[:2] = b'MZ'
            pe[60:64] = (64).to_bytes(4, 'little')
            pe[64:70] = b'PE\x00\x00\x64\x86'
            binary = root / 'worker.exe'
            binary.write_bytes(pe)
            unsafe = root / '..unsafe.dll'
            unsafe.write_bytes(pe)
            with self.assertRaises(ValueError):
                module.package(binary, 'windows-x64', 'a' * 40, root / 'out', [unsafe])
            library = root / 'runtime.dll'
            library.write_bytes(pe)
            duplicate = root / 'RUNTIME.dll'
            duplicate.write_bytes(pe)
            with self.assertRaises(ValueError):
                module.package(binary, 'windows-x64', 'a' * 40, root / 'out', [library, duplicate])


if __name__ == '__main__':
    unittest.main()
