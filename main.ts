import {
  App,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  TFolder,
  TAbstractFile,
  Notice,
  Modal,
} from "obsidian";

interface AutoBacklinksSettings {
  includedFolders: string[],
  excludedFolders: string[];
}

const DEFAULT_SETTINGS: AutoBacklinksSettings = {
  includedFolders: [],
  excludedFolders: [],
};

export default class AutoBacklinksPlugin extends Plugin {
  settings: AutoBacklinksSettings;

  async onload() {
    await this.loadSettings();

    this.addCommand({
      id: "generate-all-backlinks",
      name: "Generate Backlinks for All Markdown Files",
      callback: () => this.processAllFiles(),
    });

    this.registerEvent(
      this.app.vault.on("create", (file: TAbstractFile) => {
        if (file instanceof TFile) this.handleFileChange(file);
      })
    );

    this.registerEvent(
      this.app.vault.on("rename", (file: TAbstractFile, oldPath: string) => {
        if (file instanceof TFile) this.handleFileChange(file);
      })
    );

    this.registerEvent(
      this.app.vault.on("delete", (file: TAbstractFile) => {
        if (file instanceof TFile) this.handleFileDeletion(file);
      })
    );

    this.addSettingTab(new AutoBacklinksSettingTab(this.app, this));
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }


  shouldCreateBacklink(file: TFile): boolean {
    var isExcluded = this.settings.excludedFolders.some((folder) =>
      file.path.startsWith(folder)
    );
    var isIncluded = this.settings.includedFolders.length == 0 || this.settings.includedFolders.some((folder) =>
      file.path.startsWith(folder)
    );

    return isIncluded && !isExcluded;
  }

  async processAllFiles() {
    new ConfirmationModal(this.app, async () => {
      const files = this.app.vault
        .getFiles()
        .filter((file) => file.extension === "md" && this.shouldCreateBacklink(file));
      const notice = new Notice("Processing files...", 0);

      const results = await Promise.all(
        files.map((file) =>
          this.generateBacklinksForFile(file)
            .then(() => ({ success: true }))
            .catch((error) => ({ error }))
        )
      );

      const processed = results.filter((result) => "success" in result).length;
      const errors = results.filter((result) => "error" in result).length;

      notice.setMessage(`Processed ${processed} files. Errors: ${errors}`);
    }).open();
  }

  async handleFileChange(file: TFile) {
    if (file.extension === "md" && this.shouldCreateBacklink(file)) {
      await this.generateBacklinksForFile(file);
      await this.updateBacklinksInParentFolders(file);
    }
  }

  async handleFileDeletion(file: TFile) {
    if (file.extension === "md" && this.shouldCreateBacklink(file)) {
      await this.removeBacklinksFromParentFolders(file);
    }
  }

  async generateBacklinksForFile(file: TFile) {
    if (file.extension !== "md" || !this.shouldCreateBacklink(file)) {
      return;
    }

    try {
      const content = await this.app.vault.read(file);
      const backlinks = this.generateBacklinks(file);
      const updatedContent = this.updateBacklinksInContent(content, backlinks);
      if (content !== updatedContent) {
        await this.app.vault.modify(file, updatedContent);
      }
    } catch (error) {
      console.error(`Error generating backlinks for ${file.path}:`, error);
    }
  }

  generateBacklinks(file: TFile): string[] {
    const backlinks: string[] = [];
    let currentFolder = file.parent;

    // Do only parent folder
    if (currentFolder) {
      const isFolderNoteFile = file.basename == file.parent?.name; // is folder note
      if (isFolderNoteFile) {
        const parentFolder = currentFolder.parent?.name;
        if (parentFolder) {
          backlinks.push(`[[${currentFolder.parent?.name}]]`);
        }
      } else {
        backlinks.push(`[[${currentFolder.name}]]`);
      }
    }

    // All parent folders
    // while (currentFolder && currentFolder.path !== "/") {
    //   backlinks.push(`[[${currentFolder.path}]]`);
    //   currentFolder = currentFolder.parent;
    // }

    return backlinks.reverse();
  }

  updateBacklinksInContent(content: string, backlinks: string[]): string {

    const backlinksRegex = /\n%% Auto-generated backlinks %%[\s\S]*?%% collapse-end %%|\n## Auto-generated Backlinks[\s\S]*?(?=\n#|$)|\n>\s\[\!AUTO-BACKLINKS\].*(?:\n> .*)*/g;
    content = content.replace(backlinksRegex, "").trim();

    const backlinksSection = (backlinks.length !== 0) ? `

> [!AUTO-BACKLINKS] AUTO-BACKLINKS
> - ${backlinks.join("\n")}
` : '';

    return `${content}\n${backlinksSection}`;
  }

  async updateBacklinksInParentFolders(file: TFile) {
    await this.iterateParentFolders(file, async (folder) => {
      const folderNoteFile = this.getFolderNoteFile(folder);
      if (
        folderNoteFile &&
        folderNoteFile.extension === "md" &&
        this.shouldCreateBacklink(folderNoteFile)
      ) {
        await this.generateBacklinksForFile(folderNoteFile);
      }
    });
  }

  async removeBacklinksFromParentFolders(file: TFile) {
    await this.iterateParentFolders(file, async (folder) => {
      const folderNoteFile = this.getFolderNoteFile(folder);
      if (
        folderNoteFile &&
        folderNoteFile.extension === "md" &&
        this.shouldCreateBacklink(folderNoteFile)
      ) {
        const content = await this.app.vault.read(folderNoteFile);
        const updatedContent = content.replace(`[[${file.path}]]`, "");
        if (content !== updatedContent) {
          await this.app.vault.modify(folderNoteFile, updatedContent);
        }
      }
    });
  }

  getFolderNoteFile(folder: TFolder): TFile | null {
    const folderNoteName = folder.name + ".md";
    const file = this.app.vault.getAbstractFileByPath(
      folder.path + "/" + folderNoteName
    );
    return file instanceof TFile ? file : null;
  }

  async iterateParentFolders(
    file: TFile,
    callback: (folder: TFolder) => Promise<void>
  ) {
    let currentFolder = file.parent;
    while (currentFolder && currentFolder.path !== "/") {
      await callback(currentFolder);
      currentFolder = currentFolder.parent;
    }
  }
}

class AutoBacklinksSettingTab extends PluginSettingTab {
  plugin: AutoBacklinksPlugin;

  constructor(app: App, plugin: AutoBacklinksPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Excluded folders")
      .setDesc("Folders to exclude from backlink generation (one per line)")
      .addTextArea((text) =>
        text
          .setPlaceholder("folder1\nfolder2/subfolder")
          .setValue(this.plugin.settings.excludedFolders.join("\n"))
          .onChange(async (value) => {
            this.plugin.settings.excludedFolders = value
              .split("\n")
              .filter((folder) => folder.trim() !== "");
            await this.plugin.saveSettings();
          })
      );
      
    new Setting(containerEl)
      .setName("Included folders")
      .setDesc("Folders to included from backlink generation (one per line)")
      .addTextArea((text) =>
        text
          .setPlaceholder("folder1\nfolder2/subfolder")
          .setValue(this.plugin.settings.includedFolders.join("\n"))
          .onChange(async (value) => {
            this.plugin.settings.includedFolders = value
              .split("\n")
              .filter((folder) => folder.trim() !== "");
            await this.plugin.saveSettings();
          })
      );
  }
}

class ConfirmationModal extends Modal {
  onConfirm: () => void;

  constructor(app: App, onConfirm: () => void) {
    super(app);
    this.onConfirm = onConfirm;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.setText(
      "Are you sure you want to generate backlinks for all Markdown files? This may take a while for large vaults."
    );

    const confirmButton = contentEl.createEl("button", { text: "Confirm" });
    const cancelButton = contentEl.createEl("button", { text: "Cancel" });

    confirmButton.addEventListener("click", () => {
      this.close();
      this.onConfirm();
    });

    cancelButton.addEventListener("click", () => this.close());
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
