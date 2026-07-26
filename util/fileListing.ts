export default function fileListing(fileNames: Iterable<string>) {
  return ["BEGIN FILE LIST", ...fileNames, "END FILE LIST"].join("\n");
}
