import { Resource } from "@token-ring/registry";
import FileSystemService from "./FileSystemService.js";

/**
 * Class representing a file tree context extending DirectoryService.
 */
export default class FileMatchResource extends Resource {
 name = "FileMatchResource";
 description = "Provides file matching functionality";
 /**
  * Properties for the constructor.
  * @type {Object}
  */
 static constructorProperties = {
  items: {
   type: "array",
   description: "Files to match",
   items: {
    type: "object",
    properties: {
     path: {
      type: "string",
      required: true,
      description: "Path to directory to include"
     },
     ignore: {
      type: "string",
      description: "A .gitignore/node-glob ignore style list of files to ignore"
     },
    }
   }
  },
 };

 /**
  * Create a FileTreeResource instance.
  * @param {Object} params
  * @param {Array} params.items - Files to insert into the chat memory.
  */
 constructor({items}) {
  super();
  this.items = items;
 }

 /**
  * Asynchronously gets matched files
  * @async
  * @generator
  * @param {TokenRingRegistry} registry - The package registry
  * @yields {string} The relative path of the matched files
  */
 async* getMatchedFiles(registry) {
  const fileSystem = registry.requireFirstServiceByType(FileSystemService);

  for (const {path, include, exclude} of this.items) {
   for await (const relPath of fileSystem.getDirectoryTree(path)) {
    if (exclude?.test(relPath) || include?.test(relPath) === false) continue;

    yield relPath;
   }
  }
 }

 async addFilesToSet(set, registry) {
  for await (const relPath of this.getMatchedFiles(registry)) {
   set.add(relPath);
  }
 }
};
