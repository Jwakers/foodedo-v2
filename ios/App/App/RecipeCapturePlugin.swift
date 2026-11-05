import Capacitor
import Foundation

@objc(RecipeCapturePlugin)
public class RecipeCapturePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "RecipeCapturePlugin"
    public let jsName = "RecipeCapture"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "peek", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "claim", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "acknowledge", returnType: CAPPluginReturnPromise)
    ]
    @objc func peek(_ call: CAPPluginCall) {
        do {
            let item = try SharedRecipeInbox().peek()
            if let item {
                var data: JSObject = ["schemaVersion": item.schemaVersion, "id": item.id, "url": item.url, "createdAt": item.createdAt]
                if let text = item.sharedText { data["sharedText"] = text }
                if let owner = item.claimedBy { data["claimedBy"] = owner }
                call.resolve(["capture": data])
            } else { call.resolve([:]) }
        } catch { call.reject(error.localizedDescription) }
    }
    @objc func claim(_ call: CAPPluginCall) { update(call, acknowledge: false) }
    @objc func acknowledge(_ call: CAPPluginCall) { update(call, acknowledge: true) }
    private func update(_ call: CAPPluginCall, acknowledge: Bool) {
        guard let id = call.getString("id"), let owner = call.getString("owner"), !owner.isEmpty else { call.reject("Capture and account are required."); return }
        do {
            let inbox = try SharedRecipeInbox()
            if acknowledge { try inbox.acknowledge(id: id, owner: owner) }
            else { try inbox.claim(id: id, owner: owner) }
            call.resolve()
        } catch { call.reject(error.localizedDescription) }
    }
}
