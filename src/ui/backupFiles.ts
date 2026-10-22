// Saving and picking the backup file. The only part of Backup that differs
// between the phone (folder picker, share sheet, file picker) and web
// (download, file input).
import * as DocumentPicker from "expo-document-picker";
import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

/** Web only: downloads the file. */
function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Phone: the user picks a folder (e.g. Download) and the file is written
 * there, so it's easy to find later. Returns false if they cancelled.
 * Web: downloads the file.
 */
export async function saveBackupToFolder(name: string, text: string): Promise<boolean> {
  if (Platform.OS === "web") {
    download(name, text);
    return true;
  }
  let dir: Directory;
  try {
    dir = await Directory.pickDirectoryAsync();
  } catch {
    return false; // cancelled the folder picker
  }
  dir.createFile(name, "application/json").write(text);
  return true;
}

/** Phone: opens the share sheet (Drive, email, WhatsApp…). Web: downloads the file. */
export async function shareBackupFile(name: string, text: string): Promise<void> {
  if (Platform.OS === "web") return download(name, text);
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  file.write(text);
  await Sharing.shareAsync(file.uri, { mimeType: "application/json", dialogTitle: "Send your backup" });
}

/** Lets the user pick a backup file; its text, or null if they cancelled. */
export async function pickBackupText(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ["application/json", "text/plain", "*/*"], // some file apps don't label .json files
    copyToCacheDirectory: true,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;
  if (Platform.OS === "web") return (await asset.file?.text()) ?? null;
  return new File(asset.uri).text();
}
