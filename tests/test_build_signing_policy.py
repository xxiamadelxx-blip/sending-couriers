import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]


class BuildSigningPolicyTests(unittest.TestCase):
    def run_isolated_build(self, *arguments):
        temporary_directory = tempfile.TemporaryDirectory()
        self.addCleanup(temporary_directory.cleanup)
        root = Path(temporary_directory.name)
        script = root / "build.py"
        shutil.copy2(REPO_ROOT / "build.py", script)
        return root, subprocess.run(
            [sys.executable, str(script), "--sdk", str(root / "missing-sdk"), *arguments],
            capture_output=True,
            text=True,
            check=False,
        )

    def test_release_build_refuses_to_generate_a_replacement_signer(self):
        root, result = self.run_isolated_build()

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Refusing to generate a replacement key", result.stderr)
        self.assertNotIn("Install Android platform", result.stderr)
        self.assertFalse((root / "signing" / "courier-transfer.jks").exists())

    def test_test_signer_requires_an_explicit_flag(self):
        root, result = self.run_isolated_build("--test-signing")

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Install Android platform", result.stderr)
        self.assertNotIn("Production signing files are missing", result.stderr)
        self.assertFalse((root / "signing" / "qa" / "transfer-test.jks").exists())


if __name__ == "__main__":
    unittest.main()
