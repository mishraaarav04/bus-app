import React, { useEffect, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { api } from "../api/client";
import { getSocket } from "../api/socket";
import { useAuth } from "../context/AuthContext";
import { colors, radius } from "../theme";
import type { ChatMessage } from "../types";

/**
 * One conversation view. Not linked from any tab yet - the server side is
 * secured (sign-in required, members only), the UI to start chats comes later.
 */
export function ChatScreen({ conversationId }: { conversationId: string }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    api.getMessages(conversationId).then(setMessages).catch(() => {});
    const socket = getSocket();
    const onMsg = (msg: ChatMessage) => {
      if (msg.conversationId === conversationId) {
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      }
    };
    socket?.on("chat:message", onMsg);
    return () => {
      socket?.off("chat:message", onMsg);
    };
  }, [conversationId]);

  async function send() {
    if (!draft.trim()) return;
    const text = draft.trim();
    setDraft("");
    try {
      await api.sendMessage(conversationId, text); // arrives back over the socket
    } catch {
      setDraft(text);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <FlatList
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => (
          <View style={[styles.bubble, item.senderId === user?.id && styles.bubbleMine]}>
            <Text style={styles.sender}>{item.senderRole}</Text>
            <Text>{item.body}</Text>
          </View>
        )}
      />
      <View style={styles.inputRow}>
        <TextInput style={styles.input} value={draft} onChangeText={setDraft} placeholder="Message" />
        <Pressable style={styles.sendButton} onPress={send}>
          <Text style={styles.sendButtonText}>Send</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12 },
  bubble: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 10, marginBottom: 8, alignSelf: "flex-start", maxWidth: "80%" },
  bubbleMine: { backgroundColor: colors.primarySoft, alignSelf: "flex-end" },
  sender: { fontSize: 11, color: colors.muted, marginBottom: 2 },
  inputRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  input: { flex: 1, borderWidth: 1, borderColor: colors.line, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  sendButton: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: 16, justifyContent: "center" },
  sendButtonText: { color: colors.white, fontWeight: "700" },
});
