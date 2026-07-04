import Flutter
import GoogleMaps
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  private var hasMapsKey = false

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    // Google Maps key from Info.plist (GoogleMapsApiKey). The iOS SDK aborts
    // the process if a map view is created without one, so the key's presence
    // is exposed over app.steeple/maps and Dart never mounts a GoogleMap
    // without it (MOBILE_DESIGN §2: empty key in dev degrades, never breaks).
    if let key = Bundle.main.object(forInfoDictionaryKey: "GoogleMapsApiKey") as? String,
       !key.isEmpty {
      GMSServices.provideAPIKey(key)
      hasMapsKey = true
    }
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)

    if let registrar = engineBridge.pluginRegistry.registrar(forPlugin: "SteepleMapsCapability") {
      let hasKey = hasMapsKey
      FlutterMethodChannel(name: "app.steeple/maps", binaryMessenger: registrar.messenger())
        .setMethodCallHandler { call, result in
          switch call.method {
          case "hasApiKey": result(hasKey)
          default: result(FlutterMethodNotImplemented)
          }
        }
    }
  }
}
