# Java Extension Pack JDK Auto

[![GitHub Sponsor](https://img.shields.io/static/v1?label=Sponsor&message=%E2%9D%A4&logo=GitHub&color=ff69b4)](https://github.com/sponsors/cypher256)
![](https://github.com/cypher256/java-extension-pack/actions/workflows/eslint.yml/badge.svg)
![](https://img.shields.io/visual-studio-marketplace/d/Pleiades.java-extension-pack-jdk?color=yellow)
[![](https://img.shields.io/visual-studio-marketplace/i/Pleiades.java-extension-pack-jdk?color=blue)](vscode:extension/Pleiades.java-extension-pack-jdk)
![](https://img.shields.io/visual-studio-marketplace/last-updated/Pleiades.java-extension-pack-jdk?color=orange)

The extension greatly reduces the installation, configuration effort, and [JDK configuration errors](https://stackoverflow.com/search?q=vscode+jdk) for general Java developers. There is no need to manually install the JDK or set the `JAVA_HOME` environment variables. It also comes pre-included with extensions that most Java developers need, such as Maven, Gradle, Spring, Lombok, and Tomcat start/stop, so you can start developing right out of the box with zero configuration.
<br>
<br>
<br>

# Install
## Using Install Button
1. [![](https://img.shields.io/badge/-Open%20README.md%20in%20VSCode-107c10?style=for-the-badge&logo=visualstudiocode)](vscode:extension/Pleiades.java-extension-pack-jdk)
1. Click Install
## Using Extensions Sidebar
1. Open Extensions SideBar (Ctrl/CMD + Shift + X)
1. Search for `jdk auto`
1. Click Install
## Using Quick Pick
- Open Quick Pick (Ctrl/CMD + P), paste the following command, and press enter.<br>
`ext install Pleiades.java-extension-pack-jdk`
<br>
<br>
<br>

# Features

## JDK Auto-configuration
The JDKs are auto-configured for the current environment on VSCode startup as follows. You can check the detected JDK in User settings.json described later or Output (Ctrl + Shift + U) ≫ Dropdown: `JDK Auto`. If there are multiple JDKs of the same version, the latest minor version among them is used. If you manually install or update the JDK and want to force update the configuration of VSCode, restart VSCode or execute **>Developer: Reload Window** from the command palette (F1 or Ctrl/Cmd + Shift + P). These are applied as user (VSCode global) settings. You can manually change user settings, but if you want to customize your settings even further, consider using [workspace settings](https://code.visualstudio.com/docs/getstarted/settings) or [profiles](https://code.visualstudio.com/docs/editor/profiles).

1. Auto-fix invalid JDK configuration path (e.g. `/jdk17/bin/java` -> `/jdk17`)
1. Auto-remove configuration entries when JDK uninstalled or version path changed
1. Auto-scan from OS-specific location, SDKMAN, jEnv, jabba, ASDF, Gradle, Scoop, IntelliJ etc...
1. Auto-detect environment variables `JAVA_HOME`, `JDK_HOME` and `PATH`
1. Auto-download Adoptium LTS JDKs and available latest non-LTS JDK if not installed
1. Auto-update auto-downloaded JDKs to the latest version

|Configuration Name|Configured Value (Priority)|
|---|---|
|(*1) [java.jdt.ls.java.home](https://github.com/redhat-developer/vscode-java/wiki/JDK-Requirements#platform-versions)<br>([Issues](https://github.com/redhat-developer/vscode-java/issues?q=is%3Aissue+java.jdt.ls.java.home))|Latest LTS (*2)<br>(Setting > `JDK_HOME` > `JAVA_HOME` > `PATH`)|
|(*1) [spring-boot.ls.java.home](https://github.com/spring-projects/sts4/blob/main/vscode-extensions/vscode-spring-boot/lib/Main.ts#L30)<br>([Issues](https://github.com/spring-projects/sts4/issues?q=is%3Aissue+spring-boot.ls.java.home))|Latest LTS (*2)<br>(Setting > `JAVA_HOME` > `PATH`)|
|(*1) [rsp-ui.rsp.java.home](https://github.com/redhat-developer/vscode-rsp-ui#extension-settings)<br>([Issues](https://github.com/redhat-developer/vscode-rsp-ui/issues?q=is%3Aissue+rsp-ui.rsp.java.home))|Latest LTS (*2)<br>(Setting > `JDK_HOME` > `JAVA_HOME`> Windows Registry > `PATH`)|
|~~[java.home](https://github.com/redhat-developer/vscode-java/wiki/JDK-Requirements#universal-version)~~|Delete due to deprecated entry|
|[java.configuration.runtimes](https://code.visualstudio.com/docs/java/java-project#_configure-runtime-for-projects)<br>([Issues](https://github.com/redhat-developer/vscode-java/issues?q=is%3Aissue+java.configuration.runtimes))|Set all major JDKs scanned, detected, and downloaded<br>(Setting > `JAVA_HOME`)|
|[java.import.gradle.java.home](https://github.com/redhat-developer/vscode-java/wiki/JDK-Requirements#my-gradle-version-does-not-support-java-17)<br>([Issues](https://github.com/microsoft/vscode-gradle/issues?q=is%3Aissue+java.import.gradle.java.home))|Set default if unset<br>(Setting > `java.jdt.ls.java.home`)|
|[maven.terminal.customEnv](https://marketplace.visualstudio.com/items?itemName=vscjava.vscode-maven#additional-configurations)<br>([Issues](https://github.com/microsoft/vscode-maven/issues?q=is%3Aissue+maven.terminal.customEnv))|Set default if `JAVA_HOME` environment variable unset<br>(Setting > `JAVA_HOME`)|

(*1) The language server runtime used by VSCode extensions. Not for building and running projects.<br>
(*2) Set latest LTS if unset, Fix if unsupported older version.
<br>
<br>

#### Auto-download Support
Up to 4 LTSs and the [latest available non-LTS](https://marketplace.visualstudio.com/items?itemName=redhat.java#features) will be auto-downloaded if not installed. Unused old non-LTS that were previously auto-downloaded can safely be removed manually from the directory. Auto-download is supported on the following platforms:
- Windows x64
- macos x64, aarch64
- Linux x64, aarch64

The downloaded JDKs are stored in the following JDK Auto extension global storage directory.

|OS|JDK Auto Extension global storage directory|
|---|---|
|Windows|`%APPDATA%\Code\User\globalStorage\pleiades.java-extension-pack-jdk\ `|
|macos|`$HOME/Library/Application Support/Code/User/globalStorage/pleiades.java-extension-pack-jdk/`|
|Linux|`$HOME/.config/Code/User/globalStorage/pleiades.java-extension-pack-jdk/`|

<br>

#### e.g. Auto-configured User settings.json
Command Palette **>Preferences: Open User Settings (JSON)**
```json
// JDT Language Server
"java.jdt.ls.java.home": "c:\\Program Files\\java\\jdk-17.0.6",
// ST4 Language Server
"spring-boot.ls.java.home": "c:\\Program Files\\java\\jdk-17.0.6",
// Runtime Server Protocol Server (Not AP server VM)
"rsp-ui.rsp.java.home": "c:\\Program Files\\java\\jdk-17.0.6",
```
```json
// Project Runtimes
"java.configuration.runtimes": [
  {
    "name": "JavaSE-1.8", // Adoptium (Auto-download)
    "path": "c:\\Users\\<UserName>\\AppData\\Roaming\\Code\\User\\globalStorage\\pleiades.java-extension-pack-jdk\\8"
  },
  {
    "name": "JavaSE-11", // Corretto (Auto-scan)
    "path": "c:\\Program Files\\Amazon Corretto\\jdk11.0.18_10"
  },
  {
    "name": "JavaSE-17", // Oracle (Auto-scan)
    "path": "c:\\Program Files\\java\\jdk-17.0.6",
    "default": true // for No build tools
  },
  {
    "name": "JavaSE-18", // JAVA_HOME (Auto-detect)
    "path": "d:\\jdk\\18"
  },
  {
    "name": "JavaSE-19", // Adoptium (Auto-scan)
    "path": "c:\\Program Files\\Eclipse Adoptium\\jdk-19.0.2.7-hotspot"
  }
],
// Gradle Daemon
"java.import.gradle.java.home": "c:\\Program Files\\java\\jdk-17.0.6",
// Maven Environment Variables
"maven.terminal.customEnv": [
  {
    "environmentVariable": "JAVA_HOME",
    "value": "c:\\Program Files\\java\\jdk-17.0.6"
  }
],
```

<br>
<br>

## Terminal Auto-configuration
Terminal profiles are defined based on configured runtimes, so you can easily open a terminal by selecting the Java version from command **>Terminal: Create New Terminal (With Profile)** or Terminal (Ctrl/Cmd + \`) ≫ Profiles dropdown. The configured environment variables have no effect outside the terminal, so the system and OS user environment remain clean. The `JAVA_HOME` and `PATH` in the auto-configured terminal configuration will always be overridden from the configured runtimes, so if you want to customize it, copy the terminal configuration entry and create a new one.
<br><p>
![Switch Java Version](https://raw.githubusercontent.com/cypher256/java-extension-pack/main/image/terminal.png)
</p>

|Configuration Name|Configured Value (Original Default)|
|---|---|
|[terminal.integrated.env.*](https://code.visualstudio.com/docs/terminal/profiles#_configuring-profiles)<br>([Issues](https://github.com/microsoft/vscode/issues?q=is%3Aissue+terminal.integrated.env+JAVA_HOME))|Set default if JAVA_HOME environment variable unset<br>(Setting > JAVA_HOME)|
|[terminal.integrated.defaultProfile.windows](https://code.visualstudio.com/docs/terminal/profiles)<br>([Issues](https://github.com/microsoft/vscode/issues?q=is%3Aissue+terminal.integrated.profiles))|Set "Command Prompt" if unset on Windows<br>("PowerShell")|
|[terminal.integrated.profiles.*](https://code.visualstudio.com/docs/terminal/profiles)<br>([Issues](https://github.com/microsoft/vscode/issues?q=is%3Aissue+terminal.integrated.profiles))|Set configured runtimes to terminal<br>(None)|

<br>

A non-existent rcfile is specified so that JAVA_HOME and PATH are not overwritten at shell startup. If necessary, manually create the following rcfile.

|OS|Default Shell|rcfile Location|
|---|---|---|
|Windows|cmd|-|
|macOS|zsh|~/.zsh_jdkauto/.zshrc|
|Linux or WSL|bash|~/.bashrc_jdkauto|

<br>

#### e.g. Auto-configured User settings.json
Command Palette **>Preferences: Open User Settings (JSON)**
```json
// Terminal Default Environment Variables
"terminal.integrated.env.windows": {
  "JAVA_HOME": "c:\\Program Files\\java\\jdk-17.0.6",
  "PATH": "c:\\Program Files\\java\\jdk-17.0.6\\bin;${env:PATH}"
},
// Terminal Default Profile
"terminal.integrated.defaultProfile.windows": "Command Prompt",
// Terminal Profiles Dropdown
"terminal.integrated.profiles.windows": {
  "JavaSE-1.8": {
      "path": "cmd",
      "env": {
          "JAVA_HOME": "c:\\Users\\<UserName>\\AppData\\Roaming\\Code\\User\\globalStorage\\pleiades.java-extension-pack-jdk\\8",
          "PATH": "c:\\Users\\<UserName>\\AppData\\Roaming\\Code\\User\\globalStorage\\pleiades.java-extension-pack-jdk\\8\\bin;${env:PATH}"
      },
      "overrideName": true
  },
  "JavaSE-11": {
      "path": "cmd",
      "env": {
          "JAVA_HOME": "c:\\Program Files\\Amazon Corretto\\jdk11.0.18_10",
          "PATH": "c:\\Program Files\\Amazon Corretto\\jdk11.0.18_10\\bin;${env:PATH}"
      },
      "overrideName": true
  },
  "JavaSE-17": {
  :
}
```

<br>
<br>

## Auto-default Settings
If the user settings is not set, it will auto-set the JDK Auto default value. Note that a debug run is required to enable Hot Code Replace (Hot Deploy).

|Extension Name|Configuration Name|Original Default|JDK Auto Default|
|---|---|---|---|
|Debugger for Java|[java.debug.settings.hotCodeReplace](https://code.visualstudio.com/docs/java/java-debugging#_hot-code-replace)|`manual`|`auto`|
|Language support for Java|[java.sources.organizeImports.staticStarThreshold](https://github.com/redhat-developer/vscode-java)|`99`|`1`|
|VSCode|[editor.codeActionsOnSave](https://github.com/redhat-developer/vscode-java/pull/3015)|`{}`|See below|
|VSCode|[editor.minimap.enabled](https://github.com/redhat-developer/vscode-java/pull/3015)|`true`|`false`|
|VSCode|[editor.rulers](https://code.visualstudio.com/api/references/theme-color#:~:text=location%20with%20%22-,editor.rulers,-%22)|`[]`|See below|
|VSCode|[editor.unicodeHighlight.includeComments](https://code.visualstudio.com/updates/v1_63#_unicode-highlighting)|`inUntrustedWorkspace`|`true`|
|VSCode|[workbench.colorCustomizations](https://code.visualstudio.com/api/references/theme-color)|`{}`|See below|
|VSCode|[workbench.tree.indent](https://code.visualstudio.com/docs/getstarted/settings#:~:text=in%20pixels.%0A%20%20%22-,workbench.tree.indent,-%22%3A%208)|`8`|`20`|
|VSCode|(Windows) [files.eol](https://code.visualstudio.com/docs/getstarted/settings#:~:text=line%20character.%0A%20%20%22-,files.eol,-%22%3A%20%22auto)|`auto`|`\n`|
|VSCode|(Windows) `[bat]` : `files.eol`|`files.eol`|`\r\n`|
|Code Spell Checker|[cSpell.diagnosticLevel](https://streetsidesoftware.com/vscode-spell-checker/docs/configuration/#cspelldiagnosticlevel)|`Information`|`Hint`|
|Trailing Spaces|[trailing-spaces.includeEmptyLines](https://marketplace.visualstudio.com/items?itemName=shardulm94.trailing-spaces#:~:text=will%20be%20ignored.-,Include%20Empty%20Lines,-Default%3A%20true)|`true`|`false`|

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
  "[Visual Studio Dark][Default Dark+]": {
    "tab.activeBorder": "#0F0" // Bottom border
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
- MIT (c) 2023- WILL Shinji Kashihara (cypher256)
- Adoptium JDK: https://adoptium.net/docs/faq/#_is_temurin_free_to_use

<br>
<br>
<br>

# Included Extension Features
## Extension Pack for Java
Since many projects are nowadays using different Java versions in development, it is recommended to specify the Java version for each project instead of the `JAVA_HOME` environment variable so as not to affect the OS and OS user environment. To see which JDKs are used for your projects in multi-root workspaces, you can trigger the command **Java: Configure Java Runtime** in Command Palette. The [Configure Runtime for Projects](https://code.visualstudio.com/docs/java/java-project) view is a feature of the Extension Pack for Java (Microsoft).
<br><p>
![Configure Java Runtime](https://code.visualstudio.com/assets/docs/java/java-project/configure-project-runtime.png)
</p>

### Change JDK for Gradle and Maven projects
If you want to change the JDK version for your [Gradle](https://code.visualstudio.com/docs/java/java-build#_gradle) or [Maven](https://code.visualstudio.com/docs/java/java-build#_maven) projects, you need to update it in your build scripts (`build.gradle` or `pom.xml`). You can click ⓘ to see how to make such changes. Click 🖊 will navigate to the build script file of the project. Maven/Gradle version is recommended to be set per project in `gradle-wrapper.properties`/`maven-wrapper.properties` using wrapper `gradlew`/`mvnw`. For Spring Boot Gradle/Maven projects and general Gradle projects, these wrappers are included by default, so you don't need to install Gradle/Maven or set its environment variables.
<br>

### Change JDK for unmanaged folders
To change the JDK for [unmanaged folders](https://code.visualstudio.com/docs/java/java-tutorial#_creating-a-source-code-file) (with out any build tools), you can click the 🖊 button. It will list all the JDKs and you can select one for your unmanaged folders. This changes the `"default": true` for `java.configuration.runtimes`. Currently, it is <a href="https://github.com/redhat-developer/vscode-java/issues/2543">not possible to use different Java versions</a> in multiple unmanaged folders within the same workspace.
<br>
<br>

## Spring Boot Extension Pack
Set the JDK version when [creating a Spring Boot project](https://code.visualstudio.com/docs/java/java-spring-boot#_create-the-project) or in `build.gradle`/`pom.xml`.
<p>

![Spring Boot Dashboard](https://raw.githubusercontent.com/cypher256/java-extension-pack/main/image/spring.jpg)
</p>
<br>

## Community Server Connectors
The JDK used to run the server for Servlet and Jakarta EE applications can be specified from the context menu ≫ **Edit Server** ≫ `vm.install.path`. The [actual configuration](https://github.com/redhat-developer/vscode-rsp-ui#server-parameters) files is in `.rsp/redhat-community-server-connector/servers` in the user home.
<p>

![Servers View](https://raw.githubusercontent.com/cypher256/java-extension-pack/main/image/servers.jpg)
</p>
<br>

## Included Extensions

The `Extension Pack for Java` is required. Other extensions can be [disabled](https://code.visualstudio.com/docs/editor/extension-marketplace#_disable-an-extension) per workspace or [uninstalled](https://code.visualstudio.com/docs/editor/extension-marketplace#_uninstall-an-extension) according to your preference. If you want to set up extensions and configurations by development language, consider [Profile](https://code.visualstudio.com/docs/editor/profiles). (*) indicates that it will be installed if available in that environment at first startup.

- ![](https://img.shields.io/visual-studio-marketplace/i/vscjava.vscode-java-pack?style=plastic)
[Extension Pack for Java](https://marketplace.visualstudio.com/items?itemName=vscjava.vscode-java-pack) (Microsoft: MIT) / [VSCode Document](https://code.visualstudio.com/docs/java/java-tutorial#_creating-a-source-code-file)<br>
Popular extensions for Java development that provides Java IntelliSense, debugging, testing, Maven/Gradle support, project management and more.<br>
- ![](https://img.shields.io/visual-studio-marketplace/i/vmware.vscode-boot-dev-pack?style=plastic)
[Spring Boot Extension Pack](https://marketplace.visualstudio.com/items?itemName=vmware.vscode-boot-dev-pack) (VMWare: EPL) / [VSCode Document](https://code.visualstudio.com/docs/java/java-spring-boot#_create-the-project)<br>
A collection of extensions for developing Spring Boot applications.<br>
- ![](https://img.shields.io/visual-studio-marketplace/i/vscjava.vscode-gradle?style=plastic)
[Gradle for Java](https://marketplace.visualstudio.com/items?itemName=vscjava.vscode-gradle) (Microsoft: MIT) / [VSCode Document](https://code.visualstudio.com/docs/java/java-build#_gradle)<br>
Manage Gradle Projects, run Gradle tasks and provide better Gradle file authoring experience in VS Code.<br>
- ![](https://img.shields.io/visual-studio-marketplace/i/redhat.vscode-community-server-connector?style=plastic)
[Community Server Connectors](https://marketplace.visualstudio.com/items?itemName=redhat.vscode-community-server-connector) (Red Hat: EPL) / [VSCode Document](https://code.visualstudio.com/docs/java/java-tomcat-jetty)<br>
This VSCode Extension provides a Runtime Server Protocol based server connector, which can start, stop, publish to, and otherwise control Community runtimes and servers like Apache Felix, Karaf, and Tomcat.<br>
- ![](https://img.shields.io/visual-studio-marketplace/i/ryanluker.vscode-coverage-gutters?style=plastic)
[Coverage Gutters](https://marketplace.visualstudio.com/items?itemName=ryanluker.vscode-coverage-gutters) (ryanluker: MIT)<br>
Display test coverage generated by lcov or xml - works with many languages.
- ![](https://img.shields.io/visual-studio-marketplace/i/formulahendry.auto-rename-tag?style=plastic)
[Auto Rename Tag](https://marketplace.visualstudio.com/items?itemName=formulahendry.auto-rename-tag) (Jun Han: MIT)<br>
Auto rename paired HTML/XML tag.
- ![](https://img.shields.io/visual-studio-marketplace/i/ritwickdey.LiveServer?style=plastic)
[Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) (Ritwick Dey: MIT)<br>
Launch a development local Server with live reload feature for static & dynamic pages.
- ![](https://img.shields.io/visual-studio-marketplace/i/esbenp.prettier-vscode?style=plastic)
[Prettier - Code formatter](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) (Prettier: MIT)<br>
Code formatter using prettier.
- ![](https://img.shields.io/visual-studio-marketplace/i/streetsidesoftware.code-spell-checker?style=plastic)
[Code Spell Checker](https://marketplace.visualstudio.com/items?itemName=streetsidesoftware.code-spell-checker) (Street Side Software: GPL)<br>
Spelling checker for source code.
- ![](https://img.shields.io/visual-studio-marketplace/i/shardulm94.trailing-spaces?style=plastic)
[Trailing Spaces](https://marketplace.visualstudio.com/items?itemName=shardulm94.trailing-spaces) (Shardul Mahadik: MIT)<br>
Highlight trailing spaces and delete them in a flash!
- ![](https://img.shields.io/visual-studio-marketplace/i/oderwat.indent-rainbow?style=plastic)
[Indent-Rainbow](https://marketplace.visualstudio.com/items?itemName=oderwat.indent-rainbow) (oderwat: MIT)<br>
Makes indentation easier to read.
- ![](https://img.shields.io/visual-studio-marketplace/i/mechatroner.rainbow-csv?style=plastic)
[Rainbow CSV](https://marketplace.visualstudio.com/items?itemName=mechatroner.rainbow-csv) (mechatroner: MIT)<br>
Highlight CSV and TSV files, Run SQL-like queries.
- ![](https://img.shields.io/visual-studio-marketplace/i/s-nlf-fh.glassit?style=plastic)
(\*) [GlassIt-VSC](https://marketplace.visualstudio.com/items?itemName=s-nlf-fh.glassit) (hikarin522: MIT)<br>
VS Code Extension to set window to transparent on Windows and Linux platforms.
- ![](https://img.shields.io/visual-studio-marketplace/i/intellsmi.comment-translate?style=plastic)
(\*) [Comment Translate](https://marketplace.visualstudio.com/items?itemName=intellsmi.comment-translate) (intellsmi: MIT)<br>
This plugin uses the Google Translate API to translate comments for the VSCode programming language.
- ![](https://img.shields.io/visual-studio-marketplace/i/MS-CEINTL.vscode-language-pack-zh-hans?style=plastic)
(\*) [Language Pack](https://marketplace.visualstudio.com/search?target=VSCode&category=Language%20Packs) (Microsoft: MIT) / [VSCode Document](https://code.visualstudio.com/docs/getstarted/locales)<br>
A language pack that matches the OS Locale.<br>

<br>
<br>

# Recommended Extensions

The following are not included but are very useful extensions. Try to install it if necessary.

- ![](https://img.shields.io/visual-studio-marketplace/i/usernamehw.errorlens?style=plastic)
[Error Lens](https://marketplace.visualstudio.com/items?itemName=usernamehw.errorlens) (Alexander: Free)<br>
Improve highlighting of errors, warnings and other language diagnostics.
- ![](https://img.shields.io/visual-studio-marketplace/i/SonarSource.sonarlint-vscode?style=plastic)
[SonarLint](https://marketplace.visualstudio.com/items?itemName=SonarSource.sonarlint-vscode) (SonarSource: GPL) / [VSCode Document](https://code.visualstudio.com/docs/java/java-linting#_sonarlint)<br>
SonarLint is an IDE extension that helps you detect and fix quality issues as you write code in C, C++, Java, JavaScript, PHP, Python, HTML and TypeScript.
- ![](https://img.shields.io/visual-studio-marketplace/i/vsls-contrib.gistfs?style=plastic)
[GistPad](https://marketplace.visualstudio.com/items?itemName=vsls-contrib.gistfs) (Jonathan Carter: MIT)<br>
Manage your code snippets and developer notes using GitHub Gists and repositories.
- ![](https://img.shields.io/visual-studio-marketplace/i/GitHub.copilot?style=plastic)
[GitHub Copilot](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot) (GitHub: Subscription) / [VSCode Document](https://code.visualstudio.com/docs/editor/artificial-intelligence)<br>
Your AI pair programmer.
- ![](https://img.shields.io/visual-studio-marketplace/i/genieai.chatgpt-vscode?style=plastic)
[ChatGPT - Genie AI](https://marketplace.visualstudio.com/items?itemName=genieai.chatgpt-vscode) (Genie AI: Subscription)<br>
Your best AI pair programmer. Save conversations and continue any time. A Visual Studio Code - ChatGPT Integration. Supports GPT-4, GPT3.5, GPT3 and Codex models. Create new files, view diffs with one click; your copilot to learn code, add tests, find bugs and more.
