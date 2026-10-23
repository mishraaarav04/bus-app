import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from "react-native";
import { colors, font, radius } from "../theme";

export function Button({
  title,
  onPress,
  variant = "primary",
  disabled,
  loading,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: "primary" | "soft" | "outline" | "danger";
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const v = buttonVariants[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        v.box,
        (disabled || loading) && { opacity: 0.5 },
        pressed && { opacity: 0.85 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={v.text.color} /> : <Text style={[styles.buttonText, v.text]}>{title}</Text>}
    </Pressable>
  );
}

const buttonVariants = {
  primary: { box: { backgroundColor: colors.primary }, text: { color: colors.white } },
  soft: { box: { backgroundColor: colors.primarySoft }, text: { color: colors.primaryDark } },
  outline: {
    box: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.line },
    text: { color: colors.ink },
  },
  danger: { box: { backgroundColor: colors.danger }, text: { color: colors.white } },
} as const;

export function Field({
  label,
  error,
  ...props
}: TextInputProps & { label?: string; error?: string | null }) {
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        placeholderTextColor="#B5A598"
        {...props}
        style={[styles.input, error ? { borderColor: colors.danger } : null, props.style]}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export type PillTone = "orange" | "green" | "red" | "amber" | "gray";
const pillTones: Record<PillTone, { bg: string; fg: string }> = {
  orange: { bg: colors.primarySoft, fg: colors.primaryDark },
  green: { bg: colors.successSoft, fg: colors.success },
  red: { bg: colors.dangerSoft, fg: colors.danger },
  amber: { bg: colors.warningSoft, fg: colors.warning },
  gray: { bg: "#F3EFEB", fg: colors.muted },
};
export function Pill({ text, tone = "gray" }: { text: string; tone?: PillTone }) {
  const t = pillTones[tone];
  return (
    <View style={[styles.pill, { backgroundColor: t.bg }]}>
      <Text style={[styles.pillText, { color: t.fg }]}>{text}</Text>
    </View>
  );
}

export function statusPill(status: string): { text: string; tone: PillTone } {
  switch (status) {
    case "boarded":
      return { text: "On the bus", tone: "green" };
    case "missed":
      return { text: "Missed the bus", tone: "red" };
    case "skipped":
      return { text: "Not riding today", tone: "gray" };
    default:
      return { text: "Waiting", tone: "amber" };
  }
}

export function Avatar({ name, size = 44, tone = colors.primary }: { name: string; size?: number; tone?: string }) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: tone,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 3,
        borderColor: colors.white,
      }}
    >
      <Text style={{ color: colors.white, fontWeight: "800", fontSize: size * 0.36 }}>{initials}</Text>
    </View>
  );
}

export function Row({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: "row", alignItems: "center", gap: 12 }, style]}>{children}</View>;
}

export function ErrorText({ text }: { text?: string | null }) {
  return text ? <Text style={styles.error}>{text}</Text> : null;
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={{ alignItems: "center", paddingVertical: 24, gap: 4 }}>
      <Text style={font.h3}>{title}</Text>
      {hint ? <Text style={[font.small, { textAlign: "center" }]}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 22,
  },
  buttonText: { fontSize: 16, fontWeight: "800" },
  label: { fontSize: 13, fontWeight: "700", color: colors.muted },
  input: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    fontSize: 16,
    color: colors.ink,
  },
  error: { color: colors.danger, fontSize: 13, fontWeight: "600" },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    gap: 8,
  },
  pill: { alignSelf: "flex-start", borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { fontSize: 12, fontWeight: "800" },
});
