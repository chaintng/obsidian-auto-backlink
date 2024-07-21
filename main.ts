import {
  App,
  Plugin,
  TFile,
  TFolder,
  TAbstractFile,
  Notice,
  Modal,
} from "obsidian";

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

export default class AutoBacklinksPlugin extends Plugin {
  async onload() {
    this.addCommand({
      id: "generate-all-backlinks",
      name: "Generate Backlinks for All Markdown Files",
      callback: () => this.processAllFiles(),
    });

    this.addCommand({
      id: "reload-auto-backlinks-plugin",
      name: "Reload Auto Backlinks Plugin",
      callback: () => {
        // @ts-ignore
        this.app.plugins.disablePlugin(this.manifest.id);
        // @ts-ignore
        this.app.plugins.enablePlugin(this.manifest.id);
        new Notice("Auto Backlinks plugin reloaded");
      },
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

    this.app.workspace.onLayoutReady(() => {
      const notice = new Notice(
        "Auto Backlinks: Click here to generate backlinks for all Markdown files",
        0
      );
      notice.noticeEl.addEventListener("click", () => {
        notice.hide();
        this.processAllFiles();
      });
    });
  }

  async processAllFiles() {
    new ConfirmationModal(this.app, async () => {
      const files = this.app.vault.getFiles();
      let processed = 0;
      let errors = 0;

      for (const file of files) {
        if (file.extension === "md") {
          try {
            await this.generateBacklinksForFile(file);
            processed++;
            if (processed % 10 === 0) {
              new Notice(`Processed ${processed} Markdown files`);
            }
          } catch (error) {
            console.error(`Error processing file ${file.path}:`, error);
            errors++;
          }
        }
      }

      new Notice(
        `Backlinks generated for ${processed} Markdown files. Errors: ${errors}`
      );
    }).open();
  }

  async handleFileChange(file: TFile) {
    if (file.extension === "md") {
      await this.generateBacklinksForFile(file);
      await this.updateBacklinksInParentFolders(file);
    }
  }

  async handleFileDeletion(file: TFile) {
    if (file.extension === "md") {
      await this.removeBacklinksFromParentFolders(file);
    }
  }

  async generateBacklinksForFile(file: TFile) {
    if (file.extension !== "md") {
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
      throw error;
    }
  }

  generateBacklinks(file: TFile): string[] {
    const backlinks: string[] = [];
    let currentFolder = file.parent;
    while (currentFolder && currentFolder.path !== "/") {
      backlinks.push(`[[${currentFolder.path}]]`);
      currentFolder = currentFolder.parent;
    }
    return backlinks.reverse();
  }

  updateBacklinksInContent(content: string, backlinks: string[]): string {
    // Remove any existing backlinks section
    const backlinksRegex =
      /\n%% Auto-generated backlinks %%[\s\S]*?%% collapse-end %%|\n## Backlinks[\s\S]*?(?=\n#|$)/g;
    content = content.replace(backlinksRegex, "");

    // Trim any trailing whitespace
    content = content.trim();

    // Create the new backlinks section
    const backlinksSection = `

## Backlinks
${backlinks.join("\n")}
`;

    // Add the new backlinks section at the end
    return `${content}\n${backlinksSection}`;
  }

  async updateBacklinksInParentFolders(file: TFile) {
    let currentFolder = file.parent;
    while (currentFolder && currentFolder.path !== "/") {
      const folderNoteFile = this.getFolderNoteFile(currentFolder);
      if (folderNoteFile && folderNoteFile.extension === "md") {
        await this.generateBacklinksForFile(folderNoteFile);
      }
      currentFolder = currentFolder.parent;
    }
  }

  async removeBacklinksFromParentFolders(file: TFile) {
    let currentFolder = file.parent;
    while (currentFolder && currentFolder.path !== "/") {
      const folderNoteFile = this.getFolderNoteFile(currentFolder);
      if (folderNoteFile && folderNoteFile.extension === "md") {
        const content = await this.app.vault.read(folderNoteFile);
        const updatedContent = content.replace(`[[${file.path}]]`, "");
        if (content !== updatedContent) {
          await this.app.vault.modify(folderNoteFile, updatedContent);
        }
      }
      currentFolder = currentFolder.parent;
    }
  }

  getFolderNoteFile(folder: TFolder): TFile | null {
    const folderNoteName = folder.name + ".md";
    return this.app.vault.getAbstractFileByPath(
      folder.path + "/" + folderNoteName
    ) as TFile;
  }
}
