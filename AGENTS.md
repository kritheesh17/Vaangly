# Project Custom Rules & Instructions

## Diagnosis Workflow
Whenever the user requests to **"run diagnosis"** (or diagnostic check):
If an Android phone or device is connected via USB/ADB (`adb devices` lists a device):
1. **Device Connection**: Check device serial, state, and battery status.
2. **App Process & PID**: Check whether `com.vaangly.app` is running (`adb shell pidof com.vaangly.app`).
3. **Logcat & Crash Inspection**: Inspect recent `logcat` logs for the app PID to ensure zero fatal crashes, ANRs, or unhandled exceptions.
4. **Permissions Check**: Verify that runtime permissions (`ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, network) are properly declared and granted.
5. **Live Screen & DevTools**: Check WebView DevTools socket and capture a live screenshot to report the visual state of the device to the user.
