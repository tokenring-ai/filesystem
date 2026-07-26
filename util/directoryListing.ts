export default function directoryListing(directory: string, fileNames: Iterable<string>) {
  return [`BEGIN DIRECTORY LISTING: ${directory}`, ...fileNames, "END DIRECTORY LISTING"].join("\n");
}
