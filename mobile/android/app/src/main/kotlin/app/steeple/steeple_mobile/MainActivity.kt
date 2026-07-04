package app.steeple.steeple_mobile

import android.content.pm.PackageManager
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        // Mirrors iOS: Dart only mounts a GoogleMap when a maps key exists
        // (MOBILE_DESIGN §2 — key-less dev builds degrade, never break).
        val mapsKey = packageManager
            .getApplicationInfo(packageName, PackageManager.GET_META_DATA)
            .metaData
            ?.getString("com.google.android.geo.API_KEY")
        val hasKey = !mapsKey.isNullOrEmpty()

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "app.steeple/maps")
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "hasApiKey" -> result.success(hasKey)
                    else -> result.notImplemented()
                }
            }
    }
}
