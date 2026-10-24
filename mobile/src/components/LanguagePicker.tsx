import React from "react";
import { Pressable } from "react-native";
import { LANGUAGES, useT } from "../i18n";
import { Pill, Row } from "./ui";

export function LanguagePicker() {
  const { lang, setLang } = useT();
  return (
    <Row style={{ flexWrap: "wrap", gap: 8 }}>
      {LANGUAGES.map((l) => (
        <Pressable
          key={l.code}
          onPress={() => void setLang(l.code)}
          accessibilityRole="button"
          accessibilityLabel={l.label}
          accessibilityState={{ selected: l.code === lang }}
        >
          <Pill text={l.label} tone={l.code === lang ? "orange" : "gray"} />
        </Pressable>
      ))}
    </Row>
  );
}
