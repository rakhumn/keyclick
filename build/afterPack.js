// electron-builder skips macOS signing entirely when no signing identity is
// available. That leaves the repackaged app carrying Electron's stock
// signature, which is invalid after the bundle is modified — on Apple Silicon
// a broken signature can get the app killed at launch. Re-sign ad-hoc here so
// personal builds launch cleanly. If electron-builder already signed with a
// real Developer ID (TeamIdentifier set), leave that signature untouched.
const { execSync } = require('child_process');

exports.default = (context) => {
  if (context.electronPlatformName !== 'darwin') return;
  const appPath = `${context.appOutDir}/${context.packager.appInfo.productFilename}.app`;
  let current = '';
  try {
    current = execSync(`codesign -dv --verbose=2 "${appPath}" 2>&1`).toString();
  } catch (err) {
    current = err.stdout ? err.stdout.toString() : '';
  }
  if (/TeamIdentifier=\S+/.test(current) && !/TeamIdentifier=not set/.test(current)) {
    console.log(`Developer ID signature already present, skipping ad-hoc: ${appPath}`);
    return;
  }
  execSync(`codesign --force --deep --sign - "${appPath}"`, { stdio: 'inherit' });
  console.log(`ad-hoc signed ${appPath}`);
};
