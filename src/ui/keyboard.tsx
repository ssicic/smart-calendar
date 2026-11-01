import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Keyboard, Platform, Pressable, View, type StyleProp, type ViewStyle } from "react-native";

/**
 * How far the keyboard covers the bottom of `ref`'s view, in points (0 when
 * hidden). Android doesn't resize sheets (modals) or edge-to-edge screens for
 * the keyboard, so typing near the bottom would be hidden; this measures the
 * overlap, so it's 0 wherever the system already made room.
 */
export function useKeyboardLift(ref: RefObject<View | null>): number {
  const [lift, setLift] = useState(0);
  useEffect(() => {
    if (Platform.OS === "web") return;
    const ios = Platform.OS === "ios";
    const show = Keyboard.addListener(ios ? "keyboardWillShow" : "keyboardDidShow", (e) => {
      ref.current?.measureInWindow((_x, y, _w, h) => setLift(Math.max(0, Math.round(y + h - e.endCoordinates.screenY))));
    });
    const hide = Keyboard.addListener(ios ? "keyboardWillHide" : "keyboardDidHide", () => setLift(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [ref]);
  return lift;
}

/** A sheet's dimmed backdrop (tap to close) that lifts the sheet above the keyboard. */
export function Backdrop({ style, onPress, children }: { style: StyleProp<ViewStyle>; onPress: () => void; children: ReactNode }) {
  const ref = useRef<View>(null);
  const lift = useKeyboardLift(ref);
  return (
    <Pressable ref={ref} style={[style, lift > 0 && { paddingBottom: lift }]} onPress={onPress}>
      {children}
    </Pressable>
  );
}
