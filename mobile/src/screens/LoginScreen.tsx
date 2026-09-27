import React, { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";
import type { Role } from "../types";

const ROLES: Role[] = ["student", "parent", "admin", "driver"];

/**
 * Rudimentary login: phone/email + a role picker, no real OTP/verification
 * (see server/src/routes/auth.ts). Admin and driver accounts are supposed
 * to be provisioned by an admin in the real product — this screen doesn't
 * enforce that yet, it just logs anyone in as whatever role they pick.
 */
export function LoginScreen() {
  const { setUser } = useAuth();
  const [contact, setContact] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("student");
  const [error, setError] = useState<string | null>(null);

  async function handleLogin() {
    setError(null);
    try {
      const user = await api.login({ contact, name, role });
      setUser(user as any);
    } catch (e) {
      setError("Could not reach the server. Is it running?");
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Bus App</Text>

      <TextInput
        style={styles.input}
        placeholder="Name"
        value={name}
        onChangeText={setName}
      />
      <TextInput
        style={styles.input}
        placeholder="Phone or email"
        value={contact}
        onChangeText={setContact}
        autoCapitalize="none"
      />

      <View style={styles.roleRow}>
        {ROLES.map((r) => (
          <Pressable
            key={r}
            style={[styles.roleChip, role === r && styles.roleChipActive]}
            onPress={() => setRole(r)}
          >
            <Text style={role === r ? styles.roleTextActive : styles.roleText}>
              {r}
            </Text>
          </Pressable>
        ))}
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable style={styles.button} onPress={handleLogin}>
        <Text style={styles.buttonText}>Continue</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, gap: 12 },
  title: { fontSize: 28, fontWeight: "700", marginBottom: 24, textAlign: "center" },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  roleRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  roleChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#999",
  },
  roleChipActive: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  roleText: { color: "#333" },
  roleTextActive: { color: "#fff", fontWeight: "600" },
  button: {
    marginTop: 16,
    backgroundColor: "#2563eb",
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  error: { color: "#dc2626" },
});
