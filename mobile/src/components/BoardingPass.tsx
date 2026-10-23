import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { api } from "../api/client";
import { colors, font } from "../theme";

/**
 * The student's tap-in code. It's a signed token that expires in under a
 * minute and refreshes itself, so a screenshot is useless to anyone else.
 */
export function BoardingPass() {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState(0);

  const load = useCallback(async () => {
    try {
      const r = await api.boardingToken();
      setToken(r.token);
      setLeft(r.expiresInSec);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => {
      setLeft((l) => {
        if (l <= 6) {
          load();
          return 99;
        }
        return l - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <View style={{ alignItems: "center", gap: 14, padding: 8 }}>
      <View style={{ padding: 18, backgroundColor: colors.white, borderRadius: 24, borderWidth: 3, borderColor: colors.primary }}>
        {token ? <QRCode value={token} size={220} color={colors.ink} /> : <ActivityIndicator color={colors.primary} />}
      </View>
      <Text style={font.h3}>Show this to your driver</Text>
      <Text style={[font.small, { textAlign: "center" }]}>
        The code changes every few seconds, so a screenshot won't work.
      </Text>
      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
    </View>
  );
}
