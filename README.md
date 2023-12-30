# Java Extension Pack Auto Config

[![GitHub Sponsor](https://img.shields.io/static/v1?label=Sponsor&message=%E2%9D%A4&logo=GitHub&color=ff69b4)](https://github.com/sponsors/cypher256)
![](https://github.com/cypher256/java-extension-pack/actions/workflows/eslint.yml/badge.svg)
![](https://img.shields.io/visual-studio-marketplace/d/Pleiades.java-extension-pack-jdk?color=yellow)
![](https://img.shields.io/visual-studio-marketplace/i/Pleiades.java-extension-pack-jdk?color=blue)
![](https://img.shields.io/visual-studio-marketplace/last-updated/Pleiades.java-extension-pack-jdk?color=orange)

<br>

# Overview
Just install this extension and start Java development right out of the box with zero configuration.
* No need to install JDK, Gradle and Maven, no need to set JAVA_HOME and PATH environment variables.
* Automatically configure, update, and fix multiple Java versions (at least the four latest LTS).
* Includes extensions for Java development from Microsoft, Red Hat, Broadcom, and others.
<br><br>
Issues of the main extensions
  * [Extension Pack for Java](https://github.com/microsoft/vscode-java-pack/issues?q=is%3Aissue) (Microsoft)
  * [Language Support for Java by Red Hat](https://github.com/redhat-developer/vscode-java/issues?q=is%3Aissue) (Red Hat)
  * [Spring Boot Extension Pack](https://github.com/spring-projects/sts4/issues?q=is%3Aissue) (Broadcom)

<br>

### Open Terminals by Java Version
This extension adds the available Java versions to the VS Code terminal dropdown. Select the Java version you want to use, open terminals, and you can check the complete version with the following commands. The latest versions of gradle and mvn are available, but it is generally recommended to use wrappers (gradlew, mvnw) for each project.
```bash
java -version
gradle -v
mvn -v
```
![Terminal Java Dropdown](https://raw.githubusercontent.com/cypher256/java-extension-pack/main/image/terminal.png)

<br>

### Specify Project Java Version
The user `settings.json` is auto-configured at startup by `Java Extension Pack Auto Config`, but if you want to customize it, edit the following files ([Enabling Java preview features](https://github.com/redhat-developer/vscode-java/wiki/Enabling-Java-preview-features)).

|Project Type|Configuration|
|---|---|
|No Build Tools<br>([vscode-java](https://github.com/redhat-developer/vscode-java?tab=readme-ov-file#project-jdks))|`settings.json` ≫ `java.configuration.runtimes` ≫ `"default": true`<br>Known Issue: [Cannot specify different Java versions in the same workspace](https://github.com/redhat-developer/vscode-java/issues/2543)|
|Gradle<br>([vscode-gradle](https://github.com/microsoft/vscode-gradle?tab=readme-ov-file#java-specific-settings))|(*a) `settings.json` ≫ `java.import.gradle.java.home`<br>(*b) `build.gradle` ≫ `java` ≫ `sourceCompatibility`|
|Maven<br>([vscode-maven](https://github.com/Microsoft/vscode-maven?tab=readme-ov-file#settings))|(*a) `settings.json` ≫ `maven.terminal.customEnv` or `terminal.integrated.env.{OS}` ≫ `"JAVA_HOME"`<br>(*b) `pom.xml` ≫ `properties` ≫ `maven.compiler.source/target` (or `java.version` for Spring Boot)|

(*a) Tools Java Home: The `settings.json` [can be configured by project (workspace)](https://code.visualstudio.com/docs/getstarted/settings).<br>
(*b) The `java.configuration.runtimes` that best matches this version will be used.

<br>
<br>
<br>

# Features

The JDK, build tools, terminal and other settings are automatically configured and updated at startup according to the current environment, as shown below. If you want to disable all auto-configuration features, set `javaAutoConfig.enabled` to `false`.
<br>
<br>

## JDK Auto-configuration
Automatically configure multiple versions of the JDK and build tools. If there are multiple JDKs of the same version, the latest minor version among them is used. If you installed the JDK manually or encountered a configuration error, restart VS Code or execute Command Palette **>Java: Clean Java Language Server Workspace ≫ Reload and Delete**. These apply to User `settings.json` (VS Code global), but can be manually edited to customize them. If you want to customize your settings even further, consider using [workspace settings](https://code.visualstudio.com/docs/getstarted/settings) or [profiles](https://code.visualstudio.com/docs/editor/profiles).

1. Auto-fix invalid JDK configuration (e.g. `/java/bin` -> `/java`)
1. Auto-remove configuration entries when JDK uninstalled or version path changed
1. Auto-scan from packages SDKMAN, Homebrew, jEnv, jabba, ASDF, Gradle, Scoop, Chocolatey, IntelliJ etc...
1. Auto-scan from installations Adoptium, BellSoft, Corretto, Microsoft, Oracle, Red Hat, Semeru, Zulu etc...
1. Auto-detect environment variables `JAVA_HOME`, `JDK_HOME` and `PATH`
1. Auto-download Adoptium LTS JDKs, Gradle, Maven if not installed
1. Auto-update auto-downloaded JDKs, Gradle, Maven to the latest version

The feature automatically fixes [errors such as](https://stackoverflow.com/search?q=vs+code+java+version):

* Java Language Server requires a JDK xx+ to launch itself.
* This setting is deprecated, please use 'java.jdt.ls.java.home' instead.
* Invalid runtime for JavaSE-xx: The path points to a missing or inaccessible folder
* The java.jdt.ls.java.home variable defined in Visual Studio Code settings points to a missing or inaccessible folder

<br>

|Configuration Name|Configured Value (Priority Order)|
|---|---|
|*Language support for Java*|
|~~[java.home](https://github.com/redhat-developer/vscode-java/wiki/JDK-Requirements#universal-version)~~|Delete due to deprecated entry|
|[java.configuration.runtimes](https://code.visualstudio.com/docs/java/java-project#_configure-runtime-for-projects)<br>([Issues](https://github.com/redhat-developer/vscode-java/issues?q=is%3Aissue+java.configuration.runtimes))|Set all major JDKs scanned, detected, and downloaded<br>(Setting > `JAVA_HOME`)|
|(*1) [java.jdt.ls.java.home](https://github.com/redhat-developer/vscode-java/wiki/JDK-Requirements#platform-versions)<br>([Issues](https://github.com/redhat-developer/vscode-java/issues?q=is%3Aissue+java.jdt.ls.java.home))|Set stable LTS if Red Hat embedded JRE is not exists<br>(Setting > Embedded JRE > `JDK_HOME` > `JAVA_HOME` > `PATH`)|
|*Spring Boot Tools*|
|(*1) [spring-boot.ls.java.home](https://github.com/spring-projects/sts4/blob/main/vscode-extensions/commons-vscode/src/launch-util.ts#L140)<br>([Issues](https://github.com/spring-projects/sts4/issues?q=is%3Aissue+spring-boot.ls.java.home))|Set stable LTS if Red Hat embedded JRE is not exists<br>(Setting > Embedded JRE)|
|*Gradle for Java*|
|[java.import.gradle.java.home](https://github.com/microsoft/vscode-gradle#java-specific-settings)<br>([Issues](https://github.com/microsoft/vscode-gradle/issues?q=is%3Aissue+java.import.gradle.java.home))|Update latest if gradle auto-downloaded<br>(Setting > `java.jdt.ls.java.home`)|
|[java.import.gradle.home](https://github.com/microsoft/vscode-gradle#java-specific-settings)<br>([Issues](https://github.com/microsoft/vscode-gradle/issues?q=is%3Aissue+java.import.gradle.home))|Set latest gradle if unset<br>(**`gradlew`** > Setting > `PATH` > `GRADLE_HOME`)|
|*Maven for Java*|
|[maven.terminal.customEnv](https://marketplace.visualstudio.com/items?itemName=vscjava.vscode-maven#additional-configurations)<br>([Issues](https://github.com/microsoft/vscode-maven/issues?q=is%3Aissue+maven.terminal.customEnv))|Update latest if maven auto-downloaded (for macOS/Linux. For Windows, set to terminal.integrated.env.windows.)<br>(Setting > `JAVA_HOME`)|
|[maven.executable.path](https://github.com/Microsoft/vscode-maven#settings)<br>([Issues](https://github.com/microsoft/vscode-maven/issues?q=is%3Aissue+maven.executable.path))|Set latest maven if unset<br>(Setting > `mvnw` > `PATH`)|
|*Runtime Server Protocol UI*|(No extension included)|
|(*1) [rsp-ui.rsp.java.home](https://github.com/redhat-developer/vscode-rsp-ui#extension-settings)<br>([Issues](https://github.com/redhat-developer/vscode-rsp-ui/issues?q=is%3Aissue+rsp-ui.rsp.java.home))|Set stable LTS if unset, Fix if unsupported older version<br>(Setting > `JDK_HOME` > `JAVA_HOME`> Windows Registry > `PATH`)|

(*1) The language server runtime used by VS Code extensions. Not for building or running projects.<br>
<br>
<br>

#### Auto-download Support
Automatic download is enabled if the [extensions.autoUpdate](https://code.visualstudio.com/docs/editor/extension-marketplace#_extension-autoupdate) configuration is NOT `false`. Java downloads multiple versions, but Gradle/Maven downloads only the latest version. If you use an older version of Gradle/Maven due to compatibility issues, please introduce `gradlew` ([Compatibility](https://docs.gradle.org/current/userguide/compatibility.html)) or `mvnw` ([Compatibility](https://maven.apache.org/developers/compatibility-plan.html)) in your project or manually set `java.import.gradle.home` or `maven.executable.path` in `settings.json`.

- Adoptium JDK - [Latest LTS 4 versions](https://adoptium.net/support/#_release_roadmap) if not installed ([VS Code supported versions](https://github.com/redhat-developer/vscode-java#features))
- Gradle - Latest version
- Maven - Latest version

JDK auto-download supports the following platforms:
- Windows x64, ARM Emulation
- macOS x64, aarch64
- Linux x64, aarch64

It is saved in the following location.

|OS|Extension global storage location|
|---|---|
|Windows|`%APPDATA%\Code\User\globalStorage\pleiades.java-extension-pack-jdk\ `|
|macOS|`$HOME/Library/Application Support/Code/User/globalStorage/pleiades.java-extension-pack-jdk/`|
|Linux|`$HOME/.config/Code/User/globalStorage/pleiades.java-extension-pack-jdk/`|

<br>

#### e.g. Auto-configured User settings.json
Command Palette **>Preferences: Open User Settings (JSON)**
```json
// Project Runtimes (multiple versions)
"java.configuration.runtimes": [
  {
    "name": "JavaSE-1.8", // Adoptium (Auto-download)
    "path": "C:\\Users\\<UserName>\\AppData\\Roaming\\Code\\User\\globalStorage\\pleiades.java-extension-pack-jdk\\java\\8"
  },
  {
    "name": "JavaSE-11", // Corretto (Auto-scan)
    "path": "C:\\Program Files\\Amazon Corretto\\jdk11.0.18_10"
  },
  {
    "name": "JavaSE-17", // Oracle (Auto-scan)
    "path": "C:\\Program Files\\java\\jdk-17.0.6"
  },
  {
    "name": "JavaSE-21", // Adoptium (Auto-scan)
    "path": "C:\\Program Files\\Eclipse Adoptium\\jdk-21.0.1-hotspot",
    "default": true // Runtime to use for No build tools projects
  }
],
// Gradle Daemon Java Runtime
"java.import.gradle.java.home": "C:\\Program Files\\Eclipse Adoptium\\jdk-21.0.1-hotspot",
// Maven Environment Variables (for GUI context menu)
"maven.terminal.customEnv": [
  {
    "environmentVariable": "JAVA_HOME",
    "value": "C:\\Program Files\\Eclipse Adoptium\\jdk-21.0.1-hotspot"
  }
],
```

<br>
<br>

## Terminal Auto-configuration
The terminal dropdown items by Java version are automatically created based on the "java.configuration.runtimes" above. You can easily open a terminal by selecting the Java version from command **>Terminal: Create New Terminal (With Profile)** or Terminal (Ctrl + \`) ≫ Profiles dropdown. Besides `java`, `gradle` and `mvn` commands can also be used. The configured environment variables have no effect outside the terminal, so the system and OS user environment remain clean. The `JAVA_HOME` and `PATH` in the auto-configured terminal configuration will always be overridden from the configured runtimes, so if you want to customize it, copy the terminal configuration entry and create a new one.

|Configuration Name|Configured Value (Original Default)|
|---|---|
|[terminal.integrated.env.*](https://code.visualstudio.com/docs/terminal/profiles#_configuring-profiles)<br>([Issues](https://github.com/microsoft/vscode/issues?q=is%3Aissue+terminal.integrated.env+JAVA_HOME))|Set latest LTS if unset<br>(Setting > JAVA_HOME)|
|[terminal.integrated.defaultProfile.windows](https://code.visualstudio.com/docs/terminal/profiles)<br>([Issues](https://github.com/microsoft/vscode/issues?q=is%3Aissue+terminal.integrated.profiles))|Set `Command Prompt` if unset on Windows<br>(`PowerShell`)|
|[terminal.integrated.profiles.*](https://code.visualstudio.com/docs/terminal/profiles)<br>([Issues](https://github.com/microsoft/vscode/issues?q=is%3Aissue+terminal.integrated.profiles))|Set configured runtimes to terminal<br>(None)|
|[terminal.integrated.enablePersistentSessions](https://code.visualstudio.com/docs/terminal/advanced#_persistent-sessions)<br>([Issues](https://github.com/microsoft/vscode/issues?q=is%3Aissue+terminal.integrated.enablePersistentSessions))|`false`<br>(`true`)|
|[terminal.integrated.tabs.hideCondition](https://code.visualstudio.com/docs/terminal/appearance#_visibility)<br>([Issues](https://github.com/microsoft/vscode/issues?q=is%3Aissue+terminal.integrated.tabs.hideCondition))|`never`<br>(`singleTerminal`)|

<br>

On macOS, a non-existent rcfile is specified so that JAVA_HOME and PATH are not overwritten when the shell is started. If necessary, create the rcfile manually.

|OS|Default Shell|rcfile Location|
|---|---|---|
|Windows|cmd||
|macOS|zsh|~/.zsh_autoconfig/.zshrc|
|Linux or WSL|bash||

<br>

#### e.g. Auto-configured User settings.json
Command Palette **>Preferences: Open User Settings (JSON)**
```json
// Terminal Default Environment Variables
"terminal.integrated.env.windows": {
  "JAVA_HOME": "C:\\Program Files\\Eclipse Adoptium\\jdk-21.0.1-hotspot",
  "PATH": "C:\\Program Files\\Eclipse Adoptium\\jdk-21.0.1-hotspot\\bin;${env:PATH}"
},
// Terminal Default Profile
"terminal.integrated.defaultProfile.windows": "Command Prompt",
// Terminal Profiles Dropdown
"terminal.integrated.profiles.windows": {
  "JavaSE-1.8": {
      "path": "cmd",
      "env": {
          "JAVA_HOME": "C:\\Users\\<UserName>\\AppData\\Roaming\\Code\\User\\globalStorage\\pleiades.java-extension-pack-jdk\\java\\8",
          "PATH": "C:\\Users\\<UserName>\\AppData\\Roaming\\Code\\User\\globalStorage\\pleiades.java-extension-pack-jdk\\java\\8\\bin;${env:PATH}"
      },
      "overrideName": true
  },
  "JavaSE-11": {
      "path": "cmd",
      "env": {
          "JAVA_HOME": "C:\\Program Files\\Amazon Corretto\\jdk11.0.18_10",
          "PATH": "C:\\Program Files\\Amazon Corretto\\jdk11.0.18_10\\bin;${env:PATH}"
      },
      "overrideName": true
  },
  "JavaSE-17": {
```

<br>
<br>

## Auto-default Settings
Entries that do not have the following configuration in the user settings are automatically set to the default values of Auto Config Java. To prevent automatic setting, set the Original Default value below. Note that a debug run is required to enable Hot Code Replace (Hot Deploy).

|Configuration Name|Original Default|Auto Default|
|---|---|---|
|[editor.codeActionsOnSave](https://github.com/redhat-developer/vscode-java/pull/3015)|`{}`|See below|
|[editor.linkedEditing](https://code.visualstudio.com/Docs/languages/html#_auto-update-tags) (like *Auto Rename Tag*)|`false`|`true`|
|[editor.minimap.enabled](https://code.visualstudio.com/docs/getstarted/userinterface#_minimap)|`true`|`false`|
|[editor.rulers](https://code.visualstudio.com/api/references/theme-color#:~:text=location%20with%20%22-,editor.rulers,-%22)|`[]`|See below|
|[editor.unicodeHighlight.includeComments](https://code.visualstudio.com/updates/v1_63#_unicode-highlighting)|`inUntrustedWorkspace`|`true`|
|[emmet.variables](https://code.visualstudio.com/docs/editor/emmet#_emmet-configuration) > lang|`en`|OS locale|
|[workbench.colorCustomizations](https://code.visualstudio.com/api/references/theme-color)|`{}`|See below|
|[workbench.editor.revealIfOpen](https://code.visualstudio.com/docs/getstarted/settings#:~:text=workbench.editor.revealIfOpen)|`false`|`true`|
|[workbench.tree.indent](https://code.visualstudio.com/docs/getstarted/settings#:~:text=in%20pixels.%0A%20%20%22-,workbench.tree.indent,-%22%3A%208)|`8`|`20`|
|[files.eol](https://code.visualstudio.com/docs/getstarted/settings#:~:text=line%20character.%0A%20%20%22-,files.eol,-%22%3A%20%22auto) (For Windows)|`auto`|`\n`|
|`[bat]` > `files.eol`|`auto`|`\r\n`|
|*Language support for Java*|
|[java.configuration.updateBuildConfiguration](https://github.com/redhat-developer/vscode-java#supported-vs-code-settings)|`interactive`|`automatic`|
|[java.sources.organizeImports.staticStarThreshold](https://github.com/redhat-developer/vscode-java#supported-vs-code-settings)|`99`|`1`|
|*Debugger for Java*|
|[java.debug.settings.hotCodeReplace](https://code.visualstudio.com/docs/java/java-debugging#_hot-code-replace)|`manual`|`auto`|
|*Code Spell Checker*|
|[cSpell.diagnosticLevel](https://streetsidesoftware.com/vscode-spell-checker/docs/configuration/#cspelldiagnosticlevel)|`Information`|`Hint`|
|*Trailing Spaces*|
|[trailing-spaces.includeEmptyLines](https://marketplace.visualstudio.com/items?itemName=shardulm94.trailing-spaces#:~:text=will%20be%20ignored.-,Include%20Empty%20Lines,-Default%3A%20true)|`true`|`false`|

```json
"editor.codeActionsOnSave": {
  "source.organizeImports": true
},
"editor.rulers": [ // RGBA for transparency
  {
    "column": 80,
    "color": "#00FF0010"
  },
  {
    "column": 100,
    "color": "#BDB76B15"
  },
  {
    "column": 120,
    "color": "#FA807219"
  },
],
"workbench.colorCustomizations": {
  "[Default Dark Modern]": {
    "tab.activeBorderTop": "#00FF00",
    "tab.unfocusedActiveBorderTop" : "#00FF0088",
    "textCodeBlock.background": "#00000055", // Markdown preview code block
  },
  "editor.wordHighlightStrongBorder": "#FF6347", // Write-access
  "editor.wordHighlightBorder": "#FFD700", // Read-access
  "editor.selectionHighlightBorder": "#A9A9A9" // Double click selection
},
```
[![Highlight Default Settings](https://raw.githubusercontent.com/cypher256/java-extension-pack/main/image/default_settings.png)](https://raw.githubusercontent.com/cypher256/java-extension-pack/main/image/default_settings.png)

<br>
<br>
<br>

## Language Pack Auto-installation
The language pack corresponding to the OS locale is installed at the first startup.
* `cs`, `de`, `es`, `fr`, `it`, `ja`, `ko`, `pl`, `ru`, `tr`, `zh-hans` or `zh-hant`

<br>

## License
- MIT (c) 2023 Shinji Kashihara (cypher256) @ WILL
- Adoptium JDK: https://adoptium.net/docs/faq/#_is_temurin_free_to_use

<br>

## Thank you
A big thank you to the developers of VS Code and its extensions.

<br>

## Included Extensions

The *`Extension Pack for Java`* is required. Other extensions can be [disabled](https://code.visualstudio.com/docs/editor/extension-marketplace#_disable-an-extension) or [uninstalled](https://code.visualstudio.com/docs/editor/extension-marketplace#_uninstall-an-extension) according to your preference. Note that uninstalling this extension will <a href="https://github.com/microsoft/vscode/issues/169109">uninstall all</a> of the following extensions. If you want to set up extensions and configurations by development language, consider [Profile](https://code.visualstudio.com/docs/editor/profiles). (*) indicates that it will be installed if available in that environment at first startup.

- ![](https://img.shields.io/visual-studio-marketplace/i/vscjava.vscode-java-pack?style=plastic)
[Extension Pack for Java](https://marketplace.visualstudio.com/items?itemName=vscjava.vscode-java-pack) (Microsoft: MIT, Red Hat: EPL) / [VS Code Document](https://code.visualstudio.com/docs/java/java-tutorial#_creating-a-source-code-file)<br>
Java IntelliSense, debugging, testing, Maven/Gradle support, Lombok and more.<br>
- ![](https://img.shields.io/visual-studio-marketplace/i/vmware.vscode-boot-dev-pack?style=plastic)
[Spring Boot Extension Pack](https://marketplace.visualstudio.com/items?itemName=vmware.vscode-boot-dev-pack) (Broadcom: EPL) / [VS Code Document](https://code.visualstudio.com/docs/java/java-spring-boot#_create-the-project)<br>
A collection of extensions for developing Spring Boot applications.<br>
- ![](https://img.shields.io/visual-studio-marketplace/i/vscjava.vscode-gradle?style=plastic)
[Gradle for Java](https://marketplace.visualstudio.com/items?itemName=vscjava.vscode-gradle) (Microsoft: MIT) / [VS Code Document](https://code.visualstudio.com/docs/java/java-build#_gradle)<br>
Manage Gradle Projects, run Gradle tasks and provide better Gradle file authoring experience in VS Code.<br>
- ![](https://img.shields.io/visual-studio-marketplace/i/redhat.vscode-xml?style=plastic)
[XML](https://marketplace.visualstudio.com/items?itemName=redhat.vscode-xml) (Red Hat: EPL)<br>
XML Language Support by Red Hat (pom.xml etc.).
- ![](https://img.shields.io/visual-studio-marketplace/i/streetsidesoftware.code-spell-checker?style=plastic)
[Code Spell Checker](https://marketplace.visualstudio.com/items?itemName=streetsidesoftware.code-spell-checker) (Street Side Software: GPL)<br>
Spelling checker for source code.
- ![](https://img.shields.io/visual-studio-marketplace/i/Gruntfuggly.todo-tree?style=plastic)
[Todo Tree](https://marketplace.visualstudio.com/items?itemName=Gruntfuggly.todo-tree) (Gruntfuggly: MIT)<br>
Show TODO, FIXME, etc. comment tags in a tree view.
- ![](https://img.shields.io/visual-studio-marketplace/i/ritwickdey.LiveServer?style=plastic)
[Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) (Ritwick Dey: MIT)<br>
Launch a development local Server with live reload feature for static & dynamic pages.
- ![](https://img.shields.io/visual-studio-marketplace/i/shardulm94.trailing-spaces?style=plastic)
[Trailing Spaces](https://marketplace.visualstudio.com/items?itemName=shardulm94.trailing-spaces) (Shardul Mahadik: MIT)<br>
Highlight trailing spaces and delete them in a flash!
- ![](https://img.shields.io/visual-studio-marketplace/i/oderwat.indent-rainbow?style=plastic)
[Indent-Rainbow](https://marketplace.visualstudio.com/items?itemName=oderwat.indent-rainbow) (oderwat: MIT)<br>
Makes indentation easier to read.
- ![](https://img.shields.io/visual-studio-marketplace/i/mechatroner.rainbow-csv?style=plastic)
[Rainbow CSV](https://marketplace.visualstudio.com/items?itemName=mechatroner.rainbow-csv) (mechatroner: MIT)<br>
Highlight CSV and TSV files, Run SQL-like queries.
- ![](https://img.shields.io/visual-studio-marketplace/i/intellsmi.comment-translate?style=plastic)
(\*) [Comment Translate](https://marketplace.visualstudio.com/items?itemName=intellsmi.comment-translate) (intellsmi: MIT)<br>
This plugin uses the Google Translate API to translate comments for the VS Code programming language.
- ![](https://img.shields.io/visual-studio-marketplace/i/MS-CEINTL.vscode-language-pack-zh-hans?style=plastic)
(\*) [Language Pack](https://marketplace.visualstudio.com/search?target=vscode&category=Language%20Packs) (Microsoft: MIT) / [VS Code Document](https://code.visualstudio.com/docs/getstarted/locales)<br>
A language pack that matches the OS Locale.<br>

<br>
<br>
<br>

# Recommended Extensions

The following are not included but are very useful extensions. Try to install it if necessary.

- ![](https://img.shields.io/visual-studio-marketplace/i/rangav.vscode-thunder-client?style=plastic)
[Thunder Client](https://marketplace.visualstudio.com/items?itemName=rangav.vscode-thunder-client) (Ranga Vadhineni: Free)<br>
Lightweight Rest API Client for VS Code.
- ![](https://img.shields.io/visual-studio-marketplace/i/usernamehw.errorlens?style=plastic)
[Error Lens](https://marketplace.visualstudio.com/items?itemName=usernamehw.errorlens) (Phil Hindle: MIT)<br>
Improve highlighting of errors, warnings and other language diagnostics.
- ![](https://img.shields.io/visual-studio-marketplace/i/SonarSource.sonarlint-vscode?style=plastic)
[SonarLint](https://marketplace.visualstudio.com/items?itemName=SonarSource.sonarlint-vscode) (SonarSource: GPL) / [VS Code Document](https://code.visualstudio.com/docs/java/java-linting#_sonarlint)<br>
Detect and fix quality issues as you write code in C, C++, Java, JavaScript, PHP, Python, HTML and TypeScript.
- ![](https://img.shields.io/visual-studio-marketplace/i/shengchen.vscode-checkstyle?style=plastic)
[Checkstyle](https://marketplace.visualstudio.com/items?itemName=shengchen.vscode-checkstyle) (ShengChen: GPL) / [VS Code Document](https://code.visualstudio.com/docs/java/java-linting#_checkstyle)<br>
Provide real-time feedback about Checkstyle violations and quick fix actions.
- ![](https://img.shields.io/visual-studio-marketplace/i/LalithK90.thymeleaf-html5-snippets?style=plastic)
[Thymeleaf HTML5 Snippets](https://marketplace.visualstudio.com/items?itemName=LalithK90.thymeleaf-html5-snippets) (Lalith Kahatapitiya: GPL)<br>
Most common thymeleaf code snippets for .html file.
- ![](https://img.shields.io/visual-studio-marketplace/i/samuel-weinhardt.vscode-jsp-lang)
[Java Server Pages (JSP)](https://marketplace.visualstudio.com/items?itemName=samuel-weinhardt.vscode-jsp-lang) (Samuel Weinhardt: MIT)<br>
JSP syntax highlighting for VS Code.
- ![](https://img.shields.io/visual-studio-marketplace/i/redhat.vscode-community-server-connector?style=plastic)
[Community Server Connectors](https://marketplace.visualstudio.com/items?itemName=redhat.vscode-community-server-connector) (Red Hat: EPL) / [VS Code Document](https://code.visualstudio.com/docs/java/java-tomcat-jetty)<br>
This extension can start, stop, publish, and control servers such as Apache Felix, Karaf, and Tomcat..<br>
- ![](https://img.shields.io/visual-studio-marketplace/i/s-nlf-fh.glassit?style=plastic)
[GlassIt-VSC](https://marketplace.visualstudio.com/items?itemName=s-nlf-fh.glassit) (hikarin522: MIT)<br>
VS Code Extension to set window to transparent on Windows and Linux platforms.
- ![](https://img.shields.io/visual-studio-marketplace/i/vsls-contrib.gistfs?style=plastic)
[GistPad](https://marketplace.visualstudio.com/items?itemName=vsls-contrib.gistfs) (Jonathan Carter: MIT)<br>
Manage your code snippets and developer notes using GitHub Gists and repositories.
- ![](https://img.shields.io/visual-studio-marketplace/i/GitHub.copilot?style=plastic)
[GitHub Copilot](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot) (GitHub: Subscription) / [VS Code Document](https://code.visualstudio.com/docs/editor/artificial-intelligence)<br>
Your AI pair programmer.
- ![](https://img.shields.io/visual-studio-marketplace/i/GitHub.copilot-chat?style=plastic)
[GitHub Copilot Chat](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot-chat) (GitHub: Subscription)<br>
AI chat features powered by Copilot.
