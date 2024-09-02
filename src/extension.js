// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const cp = require('child_process');
const fs = require('fs');
const fsx = require('fs/promises');
const os = require('os');
const path = require('path');
const semver = require('semver');

const metadata = require('./metadata');

function getLocale() {
  const language = vscode.env.language;
  if (language === 'zh-cn') {
    return 'zh-CN';
  }

  return 'en-US'
}

function exec(command) {
  return new Promise((resolve, reject) => {
    cp.exec(command, (error, stdout, stderr) => {
      resolve({ error, stdout, stderr });
    });
  });
}

const emitter = new vscode.EventEmitter();

async function replace(editor, content) {
  const document = editor.document;
  const all = new vscode.Range(new vscode.Position(0, 0), document.lineAt(document.lineCount - 1).range.end);
  const edit = new vscode.WorkspaceEdit();
  edit.replace(document.uri, all, content);
  await vscode.workspace.applyEdit(edit);
  editor.selections = [new vscode.Selection(0, 0, 0, 0)];
}

/**
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {

  console.log('Congratulations, your extension "aliyuncli" is now active!');
  const locale = getLocale();

  async function popupInstallCLI(message) {
    const result = await vscode.window.showInformationMessage(message,
      {
        title: 'Documentation',
        run: installCLI
      }
    );

    if (result && result.run) {
      result.run();
    }
  }

  async function getProcess() {
    const results = await exec('which aliyun');
    if (results.stdout === "") {
      const message = `The command 'aliyun' not found on PATH, please make sure it is installed.`;
      await popupInstallCLI(message);
      return;
    }

    const { stdout } = await exec('aliyun version');
    let version = stdout.trim();
    if (version && semver.valid(version) && !semver.gte(version, '3.0.183')) {
      const message = '\'aliyun\' >= 3.0.183 required, please update your installation.';
      await popupInstallCLI(message);
    }
  }

  getProcess();

  context.subscriptions.push(vscode.commands.registerCommand('aliyuncli.installAliyunCLI', installCLI));
  context.subscriptions.push(vscode.commands.registerCommand('aliyuncli.switchProfile', switchProfile));

  context.subscriptions.push(vscode.commands.registerTextEditorCommand('aliyuncli.runLineInTerminal', () => {
    vscode.commands.executeCommand('workbench.action.terminal.runSelectedText');
  }));

  context.subscriptions.push(vscode.commands.registerTextEditorCommand('aliyuncli.runLineInEditor', async (source) => {
    const selectionStart = source.selection.start;
    const selectionEnd = source.selection.end;
    // single line command
    const selectedText = source.document.getText(new vscode.Range(selectionStart, selectionEnd));
    const document = await vscode.workspace.openTextDocument({ language: 'json' });
    const target = await vscode.window.showTextDocument(document, vscode.ViewColumn.Two, true);
    const command = selectedText.trim();
    console.log(`Running command: ${command}`);
    await replace(target, `Running command: ${command}`);
    const {stdout} = await exec(command);
    await replace(target, stdout);
  }));

  context.subscriptions.push(vscode.commands.registerCommand("aliyuncli.codelensAction", (document, range) => {
    vscode.window.activeTextEditor.selections = [
      new vscode.Selection(range.start, range.end)
    ];

    const text = vscode.window.activeTextEditor.document.getText(range);
    vscode.window.activeTerminal.sendText(text);
  }));

  context.subscriptions.push(vscode.languages.registerCodeLensProvider({
    language: 'aliyun',
    scheme: 'file',
  }, {
    provideCodeLenses(document, token) {
      const codeLenses = [];
      const text = document.getText();
      const prefix = 'aliyun ';
      let offset = 0;
      while (offset < text.length) {
        if (text.substring(offset, offset + prefix.length) === prefix) {
          const start = offset;
          offset += prefix.length;

          while (offset < text.length && !(text[offset] === '\n' && text[offset - 1] !== '\\')) {
            offset++;
          }

          const end = offset;
          const range = new vscode.Range(document.positionAt(start), document.positionAt(end));
          const run = vscode.l10n.t('run');
          codeLenses.push(new vscode.CodeLens(range, {
            title: `$(terminal) ${run}`,
            tooltip: "Run the command in terminal",
            command: "aliyuncli.codelensAction",
            arguments: [document, range]
          }));
        }

        offset++;
      }

      return codeLenses;
    }
  }));

  // create a new status bar item that we can now manage
  const myStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);

  async function updateStatusBarItem() {
    const config = await loadProfiles();
    const alibabacloud = vscode.l10n.t('Alibaba Cloud');
    myStatusBarItem.text = `$(alibabacloud-logo) ${alibabacloud}: ${config.current || 'No any profiles'}`;
    myStatusBarItem.show();
  }

  emitter.event(() => {
    updateStatusBarItem();
  });

  updateStatusBarItem();
  context.subscriptions.push(emitter);

  const myCommandId = 'aliyuncli.switchProfile';
  myStatusBarItem.command = myCommandId;
  context.subscriptions.push(myStatusBarItem);

  context.subscriptions.push(vscode.languages.registerCompletionItemProvider('aliyun', {
    async provideCompletionItems(document, position, token, context) {
      const line = document.lineAt(position).text.trim();

      if (!line.startsWith('aliyun')) {
        return;
      }

      if (line === 'aliyun configure') {
        return [
          new vscode.CompletionItem('get', vscode.CompletionItemKind.Function),
          new vscode.CompletionItem('set', vscode.CompletionItemKind.Function),
          new vscode.CompletionItem('list', vscode.CompletionItemKind.Function),
          new vscode.CompletionItem('delete', vscode.CompletionItemKind.Function),
        ];
      }

      const parts = line.split(' ');

      if (parts.length === 2) {
        const [, subcommand] = parts;
        if (subcommand === 'configure') {
          return [
            new vscode.CompletionItem('get', vscode.CompletionItemKind.Function),
            new vscode.CompletionItem('set', vscode.CompletionItemKind.Function),
            new vscode.CompletionItem('list', vscode.CompletionItemKind.Function),
            new vscode.CompletionItem('delete', vscode.CompletionItemKind.Function),
          ];
        }

        return [
          ...metadata.getApis(subcommand, getLocale()).map((d) => {
            const item = new vscode.CompletionItem(d, vscode.CompletionItemKind.Function);
            item.insertText = `${item.label} `;
            return item;
          })
        ];
      }

      if (line === 'aliyun') {

        return [
          new vscode.CompletionItem({label: 'help', description: ''}, vscode.CompletionItemKind.Function),
          new vscode.CompletionItem('version', vscode.CompletionItemKind.Function),
          new vscode.CompletionItem('configure', vscode.CompletionItemKind.Module),
          new vscode.CompletionItem({label: 'oss', description: 'Object Storage Service'}, vscode.CompletionItemKind.Module),
          ...metadata.getProducts(getLocale()).map((d) => {
            const label = {
              label: d.code.toLowerCase(),
              description: locale === 'en-US' ? d.name.en : d.name.zh
            };
            const item = new vscode.CompletionItem(label, vscode.CompletionItemKind.Module);
            item.insertText = `${label.label} `;
            return item;
          })
        ];
      }

      return [];
    }
  }, ' '));

  context.subscriptions.push(vscode.languages.registerCompletionItemProvider('aliyun', {
    async provideCompletionItems(document, position, token, context) {
      const line = document.lineAt(position).text.trim();
      const parts = line.split(' ');

      if (!line.endsWith('--')) {
        return [];
      }

      if (parts.length >= 3) {
        const [, product, api] = parts;
        const parameters = await metadata.getParameters(product, api, getLocale());
        parameters.sort((a, b) => {
          if (a.schema.required === b.schema.required) {
            return a.name.localeCompare(b.name);
          }

          return a.schema.required ? -1 : 1;
        });

        return parameters.map((d) => {
          const label = {
            label: d.schema.required ? `${d.name}` : `${d.name}?`,
            description: d.schema.description
          };

          const item = new vscode.CompletionItem(label);
          item.kind = vscode.CompletionItemKind.Field;
          item.insertText = `${d.name} `;

          if (d.schema.deprecated) {
            item.tags = [ vscode.CompletionItemTag.Deprecated ];
          }

          return item;
        });
      }
    }
  }, '-'));

  context.subscriptions.push(vscode.languages.registerHoverProvider('aliyun', {
    async provideHover(document, position, token) {
      const line = document.lineAt(position).text.trim();
      const parts = line.split(' ');
      const [, productName, api] = parts

      const link = metadata.getLink(productName, api, getLocale());
      if (link) {
        const ms = new vscode.MarkdownString(`[${vscode.l10n.t('View API documentation on OpenAPI Developer Portal')}](${link})`);
        return new vscode.Hover(ms, new vscode.Range(position, position));
      }
    }
  }));
}

async function notFound(wrongVersion) {

}

function installCLI() {
  let url = 'https://help.aliyun.com/zh/cli/installation-guide/';
  if (os.platform() === "darwin") {
    url = 'https://help.aliyun.com/zh/cli/install-cli-on-macos';
  } else if (os.platform() === 'win32') {
    url = 'https://help.aliyun.com/zh/cli/install-cli-on-windows';
  } else if (os.platform() === "linux") {
    url = 'https://help.aliyun.com/zh/cli/install-cli-on-linux';
  }
  vscode.env.openExternal(vscode.Uri.parse(url));
}

async function loadProfiles() {
  const configFilePath = path.join(os.homedir(), '.aliyun/config.json');
  const {R_OK, W_OK} = fs.constants;
  try {
    await fsx.access(configFilePath, R_OK | W_OK);
    const content = await fsx.readFile(configFilePath, 'utf-8');
    return JSON.parse(content);
  } catch (ex) {
    // empty profiles
    return { current: '', profiles: []};
  }
}

async function saveProfiles(config) {
  const configFilePath = path.join(os.homedir(), '.aliyun/config.json');
  await fsx.writeFile(configFilePath, JSON.stringify(config, null, 2));
  emitter.fire();
}

async function switchProfile() {
  const quickPick = vscode.window.createQuickPick();
  quickPick.placeholder = vscode.l10n.t('Select a profile');

  const items = [];

  const config = await loadProfiles();
  const profiles = config.profiles;

  for (const profile of profiles) {
    let label = `$(account) ${profile.name}`;
    if (profile.name === config.current) {
      label = `$(account) ${profile.name} $(check)`
    }

    items.push({
      profile: profile.name,
      label: label,
      detail: `mode: ${profile.mode}, default region: ${profile.region_id}`
    });
  }

  quickPick.items = items;

  quickPick.onDidAccept(async () => {
    vscode.window.showInformationMessage(`Switching profile to ${quickPick.selectedItems[0].profile}, done`);
    config.current = quickPick.selectedItems[0].profile;
    await saveProfiles(config);
    quickPick.dispose();
  });

  quickPick.show();
}

// This method is called when your extension is deactivated
function deactivate() {}

module.exports = {
  activate,
  deactivate
}
