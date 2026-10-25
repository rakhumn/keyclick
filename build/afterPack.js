// electron-builder skips macOS signing entirely when no signing identity is
// available. That leaves the repackaged app carrying Electron's stock
// signature, which is invalid after the bundle is modified — on Apple Silicon
// a broken signature can get the app killed at launch. Re-sign ad-hoc here so
// personal builds launch cleanly; paid distribution (Developer ID +
// notarization) replaces this hook later.
const { execSync } = require('child_process');

exports.default = (context) => {
  if (context.electronPlatformName !== 'darwin') return;
  const appPath = `${context.appOutDir}/${context.packager.appInfo.productFilename}.app`;
  execSync(`codesign --force --deep --sign - "${appPath}"`, { stdio: 'inherit' });
  console.log(`ad-hoc signed ${appPath}`);
};
