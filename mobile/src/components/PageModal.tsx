import React from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, font } from "../theme";
import { useT } from "../i18n";

/** A full-height sheet with a title and a close button. Used for every secondary screen. */
export function PageModal({
  visible,
  title,
  onClose,
  children,
  footer,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const { t } = useT();
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.white }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 14, gap: 12 }}>
            <Text style={[font.h2, { flex: 1 }]} accessibilityRole="header">
              {title}
            </Text>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t("common.close")}
              style={{ padding: 4 }}
            >
              <Ionicons name="close-circle" size={30} color={colors.primaryTint} />
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={{ padding: 20, paddingTop: 4, gap: 14 }}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
          {footer ? <View style={{ padding: 20, paddingTop: 8, gap: 10 }}>{footer}</View> : null}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
