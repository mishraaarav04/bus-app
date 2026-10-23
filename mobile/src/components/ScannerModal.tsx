import React, { useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { colors, font, radius } from "../theme";
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
  onScan: (token: string) => Promise<string>;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [result, setResult] = useState<{ text: string; ok: boolean } | null>(null);
  const busy = useRef(false);

  async function handle(data: string) {
    if (busy.current) return;
    busy.current = true;
    try {
      setResult({ text: await onScan(data), ok: true });
    } catch (e: any) {
      setResult({ text: e.message ?? "Scan failed", ok: false });
    }
    // Pause briefly so the same code isn't read twice.
    setTimeout(() => {
      setResult(null);
      busy.current = false;
    }, 1800);
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
            <Text style={[font.h2, { color: colors.white, textAlign: "center" }]}>Camera access needed</Text>
            <Text style={{ color: colors.primaryTint, textAlign: "center", marginVertical: 10 }}>
              Wheelie uses the camera only to scan students' boarding codes.
            </Text>
            <Button title="Allow camera" onPress={requestPermission} />
          </View>
        )}

        <View style={styles.frameWrap} pointerEvents="none">
          <View style={styles.frame} />
        </View>

        {result ? (
          <View style={[styles.toast, { backgroundColor: result.ok ? colors.success : colors.danger }]}>
            <Ionicons name={result.ok ? "checkmark-circle" : "alert-circle"} size={26} color={colors.white} />
            <Text style={styles.toastText}>{result.text}</Text>
          </View>
        ) : (
          <Text style={styles.hint}>Point at the student's boarding code</Text>
        )}

        <Pressable style={styles.close} onPress={onClose}>
          <Text style={styles.closeText}>Done</Text>
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
