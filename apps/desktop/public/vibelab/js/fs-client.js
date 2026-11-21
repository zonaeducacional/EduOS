export class FileSystemClient {
  static parts(path) {
    return path.split('/').slice(1);
  }

  static invoke(command, args) {
    return window.__TAURI_INTERNALS__.invoke(command, args);
  }

  static async readDirectory(path) {
    const items = await this.manage(path, { type: 'list' });
    return items.filter(item => !item.name.startsWith('.')).map(item => ({
      ...item,
      isDirectory: item.folder,
      path: `${path}/${item.name}`,
    }));
  }

  static manage(path, action) {
    return this.invoke('vibelab_files', { path: this.parts(path), action });
  }

  static transfer(path, action) {
    return this.invoke('vibelab_transfer', { path: this.parts(path), action });
  }

  static exportFile(path) {
    const separator = path.lastIndexOf('/');
    return this.manage(path.slice(0, separator), { type: 'export', name: path.slice(separator + 1) });
  }
}
