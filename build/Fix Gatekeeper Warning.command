#!/bin/bash
# Clears the macOS quarantine flag that makes this unsigned build show up as
# "damaged" in Gatekeeper. Double-click this file after dragging KeyClick.app
# into /Applications.
set -e

APP="/Applications/KeyClick.app"

if [ ! -d "$APP" ]; then
  osascript -e 'display alert "KeyClick.app not found in /Applications" message "Drag KeyClick.app into your Applications folder first, then double-click this script again." as critical'
  exit 1
fi

xattr -cr "$APP"

osascript -e 'display notification "You can now open KeyClick normally from Applications or Launchpad." with title "Gatekeeper flag cleared"'
