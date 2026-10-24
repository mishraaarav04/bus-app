import React, { useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { colors, font, radius } from "../theme";
import { useT } from "../i18n";
import { Button } from "./ui";

/**
 * Driver-side tap-in. Today it scans the QR on a student's phone; a physical
 * NFC card reader slots in here later (needs a custom dev build, not Expo Go).
 */
export function ScannerModal({
  visible,
  onClose,
  onScan,
}: {
  visible: boolean;
  onClose: () => void;
  // Resolve with a message to show; reject to show an error.
  onScan: (token: string) => Promise<{ text: string; tone: "ok" | "warn" }>;
}) {
  const { t } = useT();
  const [permission, requestPermission] = useCameraPermissions();
  const [result, setResult] = useState<{ text: string; tone: "ok" | "warn" | "error" } | null>(null);
  const busy = useRef(false);

  async function handle(data: string) {
    if (busy.current) return;
    busy.current = true;
    try {
      setResult(await onScan(data));
    } catch (e: any) {
      setResult({ text: e.message ?? t("scan.failed"), tone: "error" });
    }
    // Pause briefly so the same code isn't read twice.
    setTimeout(() => {
      setResult(null);
      busy.current = false;
    }, 2200);
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        {permission?.granted ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={({ data }) => handle(data)}
          />
        ) : (
          <View style={styles.center}>
            <Text style={[font.h2, { color: colors.white, textAlign: "center" }]}>{t("scan.cameraNeeded")}</Text>
            <Text style={{ color: colors.primaryTint, textAlign: "center", marginVertical: 10 }}>
              {t("scan.cameraWhy")}
            </Text>
            <Button title={t("scan.allowCamera")} onPress={requestPermission} />
          </View>
        )}

        <View style={styles.frameWrap} pointerEvents="none">
          <View style={styles.frame} />
        </View>

        {result ? (
          <View
            accessibilityLiveRegion="assertive"
            style={[
              styles.toast,
              { backgroundColor: result.tone === "ok" ? colors.success : result.tone === "warn" ? colors.warning : colors.danger },
            ]}
          >
            <Ionicons name={result.tone === "ok" ? "checkmark-circle" : "alert-circle"} size={26} color={colors.white} />
            <Text style={styles.toastText}>{result.text}</Text>
          </View>
        ) : (
          <Text style={styles.hint}>{t("scan.hint")}</Text>
        )}

        <Pressable style={styles.close} onPress={onClose} accessibilityRole="button" accessibilityLabel={t("common.done")}>
          <Text style={styles.closeText}>{t("common.done")}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  frameWrap: { ...StyleSheet.absoluteFill as object, alignItems: "center", justifyContent: "center" },
  frame: { width: 250, height: 250, borderRadius: 28, borderWidth: 4, borderColor: colors.primary },
  hint: { position: "absolute", bottom: 150, alignSelf: "center", color: colors.white, fontWeight: "700", fontSize: 16 },
  toast: {
    position: "absolute",
    bottom: 140,
    left: 24,
    right: 24,
    borderRadius: radius.lg,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  toastText: { color: colors.white, fontWeight: "800", fontSize: 16, flex: 1 },
  close: {
    position: "absolute",
    bottom: 50,
    alignSelf: "center",
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: radius.pill,
  },
  closeText: { color: colors.white, fontWeight: "800", fontSize: 16 },
});
