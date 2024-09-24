# Extension Pack for Java Auto Config

[![Java 23 Ready](https://img.shields.io/badge/java%2023-ready-agreen?style=for-the-badge&color=red)](https://github.com/redhat-developer/vscode-java#features)
![Downloads](https://img.shields.io/visual-studio-marketplace/d/Pleiades.java-extension-pack-jdk?style=for-the-badge&logo=microsoft)
![Installes](https://img.shields.io/visual-studio-marketplace/i/Pleiades.java-extension-pack-jdk?style=for-the-badge&logo=visual-studio-code&color=blue)
[![Buy Me a Coffee](https://img.shields.io/static/v1?label=Buy%20me%20a%20coffee&message=%E2%9D%A4&logo=coffeescript&color=orange&style=for-the-badge)](https://github.com/sponsors/cypher256)

<br>

# Overview
Just install this extension and start Java development right out of the box with zero configuration.
* No need to install JDKs, Gradle, or Maven, and no need to set `JAVA_HOME` or `PATH` environment variables.
* Automatically configures, updates, and fixes multiple Java versions (at least 4 LTS versions and the latest).
* Includes extensions for de facto standard Java development from Microsoft, Red Hat, and others.
<br><br>
GitHub Issues
  * Microsoft: [Extension Pack for Java](https://github.com/microsoft/vscode-java-pack/issues?q=is%3Aissue+sort%3Aupdated-desc) | [Maven](https://github.com/microsoft/vscode-maven/issues?q=is%3Aissue+sort%3Aupdated-desc) | [Gradle](https://github.com/microsoft/vscode-gradle/issues?q=is%3Aissue+sort%3Aupdated-desc+) | [Debug](https://github.com/microsoft/vscode-java-debug/issues?q=is%3Aissue+sort%3Aupdated-desc) | [Test](https://github.com/microsoft/vscode-java-test/issues?q=is%3Aissue+sort%3Aupdated-desc) | [Project Manager](https://github.com/microsoft/vscode-java-dependency/issues?q=is%3Aissue+sort%3Aupdated-desc)
  * Red Hat: [Language Support for Java](https://github.com/redhat-developer/vscode-java/issues?q=is%3Aissue+sort%3Aupdated-desc) | [XML](https://github.com/redhat-developer/vscode-xml/issues?q=is%3Aissue+sort%3Aupdated-desc+)
  * Broadcom: [Spring Boot Extension Pack](https://github.com/spring-projects/sts4/issues?q=is%3Aissue+sort%3Aupdated-desc) | [Initializr](https://github.com/microsoft/vscode-spring-initializr/issues?q=is%3Aissue+sort%3Aupdated-desc) | [Dashboard](https://github.com/microsoft/vscode-spring-boot-dashboard/issues?q=is%3Aissue+sort%3Aupdated-desc)

<br>

### Open Terminals by Java Version
This extension adds the Java versions available in your current environment to the VS Code terminal profiles dropdown. Select the Java version you want to use, [open a new terminal](https://code.visualstudio.com/docs/terminal/basics), and you can check the version with the following commands. While the latest versions of Gradle and Maven are available, it's generally recommended to use wrappers (gradlew, mvnw) for each project.
```bash
java -version
gradle -v
mvn -v
```
![Terminal Java Dropdown](https://raw.githubusercontent.com/cypher256/java-extension-pack/main/image/terminal.png)

<br>

### Set Default Java Version
The built-in [Select Default Profile](https://code.visualstudio.com/docs/terminal/profiles) in VSCode only changes the default terminal profile. However, this extension applies the selected profile's Java version to all Java-related settings (⭐) within the **user** (global) [`settings.json`](https://code.visualstudio.com/docs/getstarted/settings#_settingsjson). To specify a different Java version for individual settings, edit the following files.
<br>
<br>

* **General ([vscode-java](https://github.com/redhat-developer/vscode-java?tab=readme-ov-file#project-jdks))**<br>
  (*1) User `settings.json` (Java runtimes common settings)


  ```json
  "java.configuration.runtimes": [
    {
      "name": "JavaSE-1.8",
      "path": "C:\\Program Files\\java\\jdk-1.8.0_402",
    },
    {
      "name": "JavaSE-11",
      "path": "C:\\Program Files\\java\\jdk-11.0.21",
    },
    {
      "name": "JavaSE-17",
      "path": "C:\\Program Files\\java\\jdk-17.0.12"
    },
    {
      "name": "JavaSE-21",
      "path": "C:\\Program Files\\java\\jdk-21.0.8",
      "default": true //⭐ default when creating "No build tools" project
    }
  ]
  ```
<br>

* **Gradle ([vscode-gradle](https://github.com/microsoft/vscode-gradle?tab=readme-ov-file#java-specific-settings))**
  <br>
  (*1) User `settings.json` (Gradle execution runtime)

  ```json
  "java.import.gradle.java.home": "C:\\Program Files\\java\\jdk-21.0.8" //⭐
  ```
  (*2) Project `build.gradle` ([`options.release`](https://docs.gradle.org/current/userguide/building_java_projects.html#sec:compiling_with_release))

  ```gradle
  def javaVersion = 17
  java.sourceCompatibility = javaVersion // Make it recognize to VS Code
  compileJava.options.release = javaVersion // JEP 247: API validation
  ```
  The [Gradle Toolchain](https://docs.gradle.org/current/userguide/building_java_projects.html#sec:java_cross_compilation) allows you to specify the exact JDK version to use for building.
  ```gradle
  java.toolchain.languageVersion = JavaLanguageVersion.of(17)
  ```
<br>

* **Maven ([vscode-maven](https://github.com/Microsoft/vscode-maven?tab=readme-ov-file#settings))**
  <br>
  (*1) User `settings.json` (Maven execution runtime)

  ```json
  "maven.terminal.customEnv": [
    {
      "environmentVariable": "JAVA_HOME",
      "value": "C:\\Program Files\\java\\jdk-21.0.8" //⭐
    }
  ]
  ```
  (*2) Project `pom.xml` ([`maven.compiler.release`](https://maven.apache.org/plugins/maven-compiler-plugin/examples/set-compiler-release.html))

  ```xml
  <properties>
      <!-- <maven.compiler.source>17</maven.compiler.source> -->
      <!-- <maven.compiler.target>17</maven.compiler.target> -->
      <maven.compiler.release>17</maven.compiler.release><!-- JEP 247: API validation -->
  </properties>
  ```
  The [Maven Toolchain](https://maven.apache.org/guides/mini/guide-using-toolchains.html) allows you to specify the exact JDK version to use for building.
<br><br>

(*1) The `settings.json` [can be overridden by the project (workspace)](https://code.visualstudio.com/docs/getstarted/settings#_workspace-settings).<br>
(*2) The `java.configuration.runtimes` that best matches this version will be used. Setting the `release` ensures the specified version syntax and API are used, regardless of which compiler version actually performs the compilation.
* JEP 182: [Retiring javac -source and -target](https://openjdk.org/jeps/182) / JEP 247: [Compile for Older Platform Versions](https://openjdk.org/jeps/247)
* Since Spring Boot 3.1, Maven's [`<java.version>` value is set to `<maven.compiler.release>`](https://github.com/spring-projects/spring-boot/pull/34365).
* [Enabling Java Preview Features](https://github.com/redhat-developer/vscode-java/wiki/Enabling-Java-preview-features)

<br>
<br>
<br>

# Features

JDKs, build tools, terminal settings, and other configurations are automatically set up and updated at startup based on the current environment, as shown below. If you want to disable all auto-configuration features, set `javaAutoConfig.enabled` to `false`. However, `java.import.gradle.java.home` and `maven.executable.path` are always prepended to the `PATH` in the terminal.
<br>
<br>

## JDK Auto-Configuration
Automatically configure multiple versions of the JDK and build tools. If there are multiple JDKs of the same version, the latest minor version will be used. If you installed the JDK manually or encountered a configuration error, restart VS Code or execute **>Java: Clean Java Language Server Workspace ≫ Reload and delete** from the Command Palette. These settings are applied to the user `settings.json` (VS Code global), but can be manually edited for customization. If you want to further customize your setup, consider using [workspace settings](https://code.visualstudio.com/docs/getstarted/settings) or [profiles](https://code.visualstudio.com/docs/editor/profiles).

1. Auto-fix invalid JDK configuration (e.g. `/foo/jdk-21.0.8/bin` -> `/foo/jdk-21.0.8`)
1. Auto-remove configuration entries when JDK uninstalled or version path changed
1. Auto-scan from OS specific locations, Package Managers and Toolchains (See next section)
1. Auto-detect environment variables `JAVA_HOME`, `JDK_HOME` and `PATH`
1. Auto-download Adoptium LTS JDKs, Gradle, Maven if not detected
1. Auto-update auto-downloaded JDKs, Gradle, Maven to the latest version

Best Auto-Scan
* OS specific locations: Adoptium, BellSoft, Corretto, Microsoft, Oracle, Red Hat, Semeru, Zulu etc...
* Package Managers: asdf, Chocolatey, jabba, jEnv, Homebrew, IntelliJ, mise, Scoop, SDKMAN, vfox etc...
* Toolchains: Gradle jdks directory, Maven toolchains.xml
* Own Support: Windows `C:\Java\*`, `D:\Java\*` (e.g. `C:\Java\jdk-21.0.8`)

The feature automatically fixes [errors such as](https://stackoverflow.com/search?tab=newest&q=%5bvisual-studio-code%5d%20java_home)

* Java Language Server requires a JDK xx+ to launch itself.
* This setting is deprecated, please use 'java.jdt.ls.java.home' instead.
* Invalid runtime for JavaSE-xx: The path points to a missing or inaccessible folder
* The java.jdt.ls.java.home variable defined in Visual Studio Code settings points to a missing or inaccessible folder

<br>

For Included Extensions

|Configuration Name|Configured Value [Precedence]|
|---|---|
|*Language support for Java*|
|[java.configuration.runtimes](https://code.visualstudio.com/docs/java/java-project#_configure-runtime-for-projects)<br>([Issues](https://github.com/redhat-developer/vscode-java/issues?q=is%3Aissue+java.configuration.runtimes)) ⭐ default|Set all detected and downloaded JDKs (default: Latest)<br>[This setting > `JAVA_HOME`]|
|[java.jdt.ls.java.home](https://github.com/redhat-developer/vscode-java/wiki/JDK-Requirements#platform-versions)<br>([Issues](https://github.com/redhat-developer/vscode-java/issues?q=is%3Aissue+java.jdt.ls.java.home)) 🛠️|Remove setting if Red Hat embedded JRE exists<br>[This setting > Embedded JRE > `JDK_HOME` > `JAVA_HOME` > `PATH`]|
|~~[java.home](https://github.com/redhat-developer/vscode-java/wiki/JDK-Requirements#universal-version)~~|Remove as it has been replaced by `java.jdt.ls.java.home`|
|*Spring Boot Tools*|
|[spring-boot.ls.java.home](https://github.com/spring-projects/sts4/blob/main/vscode-extensions/commons-vscode/src/launch-util.ts#L140)<br>([Issues](https://github.com/spring-projects/sts4/issues?q=is%3Aissue+spring-boot.ls.java.home)) 🛠️|Remove setting if Red Hat embedded JRE exists<br>[This setting > Embedded JRE > `JAVA_HOME` > `PATH`]|
|*Gradle for Java*|
|[java.import.gradle.java.home](https://github.com/microsoft/vscode-gradle#java-specific-settings)<br>([Issues](https://github.com/microsoft/vscode-gradle/issues?q=is%3Aissue+java.import.gradle.java.home)) ⭐|Set latest LTS JDK if unset<br>[This setting > Embedded JRE > `java.jdt.ls.java.home` > `JAVA_HOME` > `PATH` > jdk-utils > `java.configuration.runtimes` default]|
|[java.import.gradle.home](https://github.com/microsoft/vscode-gradle#java-specific-settings)<br>([Issues](https://github.com/microsoft/vscode-gradle/issues?q=is%3Aissue+java.import.gradle.home))|Set auto-downloaded gradle if unset<br>[**`gradlew`** > This setting > `PATH` > `GRADLE_HOME`]|
|*Maven for Java*|
|[maven.terminal.customEnv](https://marketplace.visualstudio.com/items?itemName=vscjava.vscode-maven#additional-configurations)<br>([Issues](https://github.com/microsoft/vscode-maven/issues?q=is%3Aissue+maven.terminal.customEnv)) ⭐|Set latest LTS JDK if unset<br>[This setting > `JAVA_HOME`]|
|[maven.executable.path](https://marketplace.visualstudio.com/items?itemName=vscjava.vscode-maven#additional-configurations)<br>([Issues](https://github.com/microsoft/vscode-maven/issues?q=is%3Aissue+maven.executable.path)) 📝|Set auto-downloaded maven if unset (If you want to use `mvnw`, set "" manually)<br>[This setting > **`mvnw`** > `PATH`]|

For Optional Extensions (If installed)

|Configuration Name|Configured Value [Precedence]|
|---|---|
|*IBM Z Open Editor*<br>[zopeneditor.JAVA_HOME](https://github.com/IBM/zopeneditor-about?tab=readme-ov-file#selecting-the-java-installation-to-use)<br>([Issues](https://github.com/IBM/zopeneditor-about/issues?q=is%3Aissue+JAVA_HOME)) 🛠️📝|Set previous LTS if unset<br>[This setting > `JAVA_HOME` > `PATH`]|
|*PlantUML*<br>[plantuml.java](https://github.com/qjebbs/vscode-plantuml?tab=readme-ov-file#extension-settings)<br>([Issues](https://github.com/qjebbs/vscode-plantuml/issues?q=is%3Aissue+plantuml.java)) 🛠️|Set stable LTS if unset<br>[This setting > `PATH`]|
|*Runtime Server Protocol UI*<br>[rsp-ui.rsp.java.home](https://github.com/redhat-developer/vscode-rsp-ui#extension-settings)<br>([Issues](https://github.com/redhat-developer/vscode-rsp-ui/issues?q=is%3Aissue+rsp-ui.rsp.java.home)) 🛠️|Set stable LTS if unset<br>[This setting > `JDK_HOME` > `JAVA_HOME` > Windows Registry > `PATH`]|
|*Salesforce Extension Pack*<br>[salesforcedx-vscode-apex.java.home](https://developer.salesforce.com/tools/vscode/en/vscode-desktop/java-setup)<br>([Issues](https://github.com/forcedotcom/salesforcedx-vscode/issues?q=is%3Aissue+salesforcedx-vscode-apex.java.home)) 🛠️|Set previous LTS if unset<br>[This setting > `JDK_HOME` > `JAVA_HOME` > Windows Registry > `PATH`]|
|*Scala (Metals)*<br>[metals.javaHome](https://github.com/scalameta/metals-vscode/blob/main/packages/metals-vscode/README.md#configure-java-version)<br>([Issues](https://github.com/scalameta/metals/issues?q=is%3Aissue+metals.javaHome)) 🛠️|Set previous LTS if unset<br>[This setting > `JAVA_HOME` > Windows Registry > `PATH`]|

⭐ The Java version specified in [Select Default Profile](https://code.visualstudio.com/docs/terminal/profiles) is set.<br>
🛠️ The language server runtime used by VS Code extensions. Not for building or running projects.<br>
📝 This setting cannot be overridden per workspace (project).
<br>
<br>

#### Auto-Download Support
Automatic downloads are enabled if the [extensions.autoUpdate](https://code.visualstudio.com/docs/editor/extension-marketplace#_extension-autoupdate) setting is NOT set to `false`. Java will download multiple versions, but Gradle and Maven will only download the latest version. If you use an older version of Gradle/Maven due to compatibility issues, consider using `gradlew` ([Compatibility](https://docs.gradle.org/current/userguide/compatibility.html)) or `mvnw` ([Compatibility](https://maven.apache.org/developers/compatibility-plan.html)) in your project or manually set `java.import.gradle.home` or `maven.executable.path` in `settings.json`.

- JDK - [Latest Adoptium LTS 4 versions](https://adoptium.net/support/#_release_roadmap) if not detected ([VS Code supported versions](https://github.com/redhat-developer/vscode-java#features))
- Gradle - Latest version
- Maven - Latest version

JDK auto-download supports the following platforms:
- Windows x64, ARM Emulation
- Mac x64, aarch64
- Linux x64, aarch64

It is saved in the following location.

|OS|Extension global storage location|
|---|---|
|Windows|`%APPDATA%\Code\User\globalStorage\pleiades.java-extension-pack-jdk\ `|
|Mac|`$HOME/Library/Application Support/Code/User/globalStorage/pleiades.java-extension-pack-jdk/`|
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
    "path": "C:\\Program Files\\java\\jdk-17.0.12"
  },
  {
    "name": "JavaSE-21", // Adoptium (Auto-scan)
    "path": "C:\\Program Files\\Eclipse Adoptium\\jdk-21.0.8-hotspot",
    "default": true //⭐
  }
],
// Gradle Daemon Java Runtime
"java.import.gradle.java.home": "C:\\Program Files\\Eclipse Adoptium\\jdk-21.0.8-hotspot", //⭐
// Maven Environment Variables (for GUI context menu)
"maven.terminal.customEnv": [
  {
    "environmentVariable": "JAVA_HOME",
    "value": "C:\\Program Files\\Eclipse Adoptium\\jdk-21.0.8-hotspot" //⭐
  }
],
```

<br>
<br>

## Terminal Auto-Configuration
The terminal dropdown items by Java version are automatically created based on the `java.configuration.runtimes` above. You can easily open a terminal by selecting the Java version from command **>Terminal: Create New Terminal (With Profile)** or Terminal (Ctrl + \`) ≫ Profiles dropdown. Besides `java`, `gradle` and `mvn` commands can also be used. The configured environment variables have no effect outside the terminal, so the system and OS user environment remain clean. The terminal configuration `terminal.integrated.profiles` is always overwritten from `java.configuration.runtimes`, so if you want to customize it, copy the terminal configuration entry and create an entry with a different name.

|Configuration Name|Configured Value [Original Default]|
|---|---|
|[terminal.integrated.env.windows](https://code.visualstudio.com/docs/terminal/profiles#_configuring-profiles)<br>([Issues](https://github.com/microsoft/vscode/issues?q=is%3Aissue+terminal.integrated.env+JAVA_HOME)) *Windows only* ⭐|Set latest LTS if unset<br>[None]|
|[terminal.integrated.defaultProfile.{platform}](https://code.visualstudio.com/docs/terminal/profiles)<br>([Issues](https://github.com/microsoft/vscode/issues?q=is%3Aissue+terminal.integrated.profiles))|Set latest LTS profiles name (e.g. `JavaSE-21 LTS`)<br>[Windows:`cmd`, Mac:`zsh`, Linux:`bash`]|
|[terminal.integrated.automationProfile.windows](https://code.visualstudio.com/docs/terminal/profiles#_configuring-the-taskdebug-profile)<br>([Issues](https://github.com/microsoft/vscode/issues?q=is%3Aissue+terminal.integrated.automationProfile)) *Windows only*|`"path": "cmd"`<br>[null] Suppress error: '[Incorrect parameter format -/d](https://github.com/microsoft/vscode/issues/202691)'|
|[terminal.integrated.profiles.{platform}](https://code.visualstudio.com/docs/terminal/profiles)<br>([Issues](https://github.com/microsoft/vscode/issues?q=is%3Aissue+terminal.integrated.profiles)) ⭐ Mac:`zsh`, Linux:`bash`|Set configured runtimes to terminal<br>[None]|
|[terminal.integrated.enablePersistentSessions](https://code.visualstudio.com/docs/terminal/advanced#_persistent-sessions)<br>([Issues](https://github.com/microsoft/vscode/issues?q=is%3Aissue+terminal.integrated.enablePersistentSessions))|`false`<br>[`true`]|
|[terminal.integrated.tabs.hideCondition](https://code.visualstudio.com/docs/terminal/appearance#_visibility)<br>([Issues](https://github.com/microsoft/vscode/issues?q=is%3Aissue+terminal.integrated.tabs.hideCondition))|`never`<br>[`singleTerminal`]|
|[java.test.config](https://code.visualstudio.com/docs/java/java-testing#_customize-test-configurations) > vmArgs<br>([Issues](https://github.com/microsoft/vscode-java-test/issues?q=is%3Aissue+java.test.config)) *Windows only*|`-Dstdout.encoding=UTF-8`, `-Derrout.encoding=UTF-8`<br>[`undefined`]|

<br>

#### e.g. Auto-configured User settings.json
Command Palette **>Preferences: Open User Settings (JSON)**
```json
// Terminal Default Environment Variables
"terminal.integrated.env.windows": {
    "PATH": "C:\\Program Files\\Eclipse Adoptium\\jdk-21.0.8-hotspot\\bin;${env:PATH}", //⭐
    "JAVA_HOME": "C:\\Program Files\\Eclipse Adoptium\\jdk-21.0.8-hotspot"
},
// Terminal Default Profile (Changing this value will set all ⭐)
"terminal.integrated.defaultProfile.windows": "JavaSE-21 LTS",
"terminal.integrated.automationProfile.windows": {
    "path": "cmd"
},
// Terminal Profiles Dropdown
"terminal.integrated.profiles.windows": {
    "JavaSE-1.8 LTS": {...},
    "JavaSE-11 LTS": {...},
    "JavaSE-17 LTS": {
        "overrideName": true,
        "env": {
            "PATH": "C:\\Program Files\\java\\jdk-17.0.12\\bin;${env:PATH}",
            "JAVA_HOME": "C:\\Program Files\\java\\jdk-17.0.12"
        },
        "path": "cmd"
    },
    "JavaSE-21 LTS": {
        "overrideName": true,
        "env": {
            "PATH": "C:\\Program Files\\Eclipse Adoptium\\jdk-21.0.8-hotspot\\bin;${env:PATH}",
            "JAVA_TOOL_OPTIONS": "-Dstdout.encoding=UTF-8 -Dstderr.encoding=UTF-8", // Windows
            "JAVA_HOME": "C:\\Program Files\\Eclipse Adoptium\\jdk-21.0.8-hotspot"
        },
        "path": "cmd",
        // For Windows, auto-configured Java 19+ terminals are set to `chcp 65001`.
        "args": ["/k", "chcp", "65001"]
    }
}
```

<br>
<br>

## Auto-Default Settings
Entries without the following configurations in the user settings are automatically set to the default values of `Extension Pack for Java Auto Config`. To prevent automatic configuration, set the original default values listed below. Note that a debug run is required to enable Hot Code Replace (Hot Deploy).

For Included Extensions

|Configuration Name|Original Default|Auto Default|
|---|---|---|
|[editor.codeActionsOnSave](https://github.com/redhat-developer/vscode-java/pull/3015)|`{}`|Described later|
|[editor.linkedEditing](https://code.visualstudio.com/Docs/languages/html#_auto-update-tags) (like *Auto Rename Tag*)|`false`|`true`|
|[editor.minimap.enabled](https://code.visualstudio.com/docs/getstarted/userinterface#_minimap)|`true`|`false`|
|[editor.rulers](https://code.visualstudio.com/api/references/theme-color#:~:text=location%20with%20%22-,editor.rulers,-%22)|`[]`|Described later|
|[editor.unicodeHighlight.includeComments](https://code.visualstudio.com/updates/v1_63#_unicode-highlighting)|`inUntrustedWorkspace`|`true`|
|[emmet.variables](https://code.visualstudio.com/docs/editor/emmet#_emmet-configuration) > lang|`en`|OS locale|
|[workbench.colorCustomizations](https://code.visualstudio.com/api/references/theme-color)|`{}`|Described later|
|[workbench.editor.revealIfOpen](https://code.visualstudio.com/docs/getstarted/settings#:~:text=workbench.editor.revealIfOpen)|`false`|`true`|
|[workbench.tree.indent](https://code.visualstudio.com/docs/getstarted/settings#:~:text=in%20pixels.%0A%20%20%22-,workbench.tree.indent,-%22%3A%208)|`8`|`20`|
|[files.eol](https://code.visualstudio.com/docs/getstarted/settings#:~:text=line%20character.%0A%20%20%22-,files.eol,-%22%3A%20%22auto) (For Windows)|`auto`|`\n`|
|`[bat]` > `files.eol`|`auto`|`\r\n`|
|*Language support for Java*|
|[java.compile.nullAnalysis.mode](https://github.com/redhat-developer/vscode-java#supported-vs-code-settings)|`interactive`|`automatic`|
|[java.configuration.detectJdksAtStart](https://github.com/redhat-developer/vscode-java#supported-vs-code-settings)|`true`|`false`|
|[java.configuration.updateBuildConfiguration](https://github.com/redhat-developer/vscode-java#supported-vs-code-settings)|`interactive`|`automatic`|
|[java.dependency.packagePresentation](https://github.com/microsoft/vscode-java-dependency/tree/main?tab=readme-ov-file#settings)|`flat`|`hierarchical`|
|[java.maxConcurrentBuilds](https://github.com/redhat-developer/vscode-java#supported-vs-code-settings)|`1`|Number of logical CPU|
|[java.sources.organizeImports.staticStarThreshold](https://github.com/redhat-developer/vscode-java#supported-vs-code-settings)|`99`|`1`|
|*Debugger for Java*<br>[java.debug.settings.hotCodeReplace](https://code.visualstudio.com/docs/java/java-debugging#_hot-code-replace)|`manual`|`auto`|
|*Code Spell Checker*<br>[cSpell.diagnosticLevel](https://streetsidesoftware.com/vscode-spell-checker/docs/configuration/#cspelldiagnosticlevel)|`Information`|`Hint`|
|*Trailing Spaces*|
|[trailing-spaces.backgroundColor](https://github.com/shardulm94/vscode-trailingspaces?tab=readme-ov-file#background-color)|`rgba(255,0,0,0.3)`|`rgba(255,0,0,0.1)`|
|[trailing-spaces.includeEmptyLines](https://github.com/shardulm94/vscode-trailingspaces?tab=readme-ov-file#include-empty-lines)|`true`|`false`|

For Optional Extensions (If installed)

|Configuration Name|Original Default|Auto Default|
|---|---|---|
|*JSP Language Support*<br>[emmet.includeLanguages](https://code.visualstudio.com/docs/editor/emmet#_emmet-abbreviations-in-other-file-types)|`{}`|`{"jsp": "html"}`|
|*Thunder Client*<br>thunder-client.requestLayout|`Left/Right`|`Top/Bottom`|

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

## Language Pack Auto-Installation
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

The *`Extension Pack for Java`* is required. Other extensions can be [disabled](https://code.visualstudio.com/docs/editor/extension-marketplace#_disable-an-extension) or [uninstalled](https://code.visualstudio.com/docs/editor/extension-marketplace#_uninstall-an-extension) based on your preference. If you want to configure extensions and configurations by development language, consider using [Profiles](https://code.visualstudio.com/docs/editor/profiles). Extensions marked with (*) will be installed automatically if available in the environment at first startup. Note that uninstalling the `Extension Pack for Java Auto Config` will <a href="https://github.com/microsoft/vscode/issues/169109">uninstall all</a> of the following extensions.

- ![](https://img.shields.io/visual-studio-marketplace/i/streetsidesoftware.code-spell-checker?style=plastic)
[Code Spell Checker](https://marketplace.visualstudio.com/items?itemName=streetsidesoftware.code-spell-checker) (Street Side Software: GPL)<br>
Spelling checker for source code.
- ![](https://img.shields.io/visual-studio-marketplace/i/intellsmi.comment-translate?style=plastic)
(\*) [Comment Translate](https://marketplace.visualstudio.com/items?itemName=intellsmi.comment-translate) (intellsmi: MIT)<br>
This plugin uses the Google Translate API to translate comments for the VS Code programming language.
- ![](https://img.shields.io/visual-studio-marketplace/i/vscjava.vscode-java-pack?style=plastic)
[Extension Pack for Java](https://marketplace.visualstudio.com/items?itemName=vscjava.vscode-java-pack) (Microsoft: MIT, Red Hat: EPL) / [VS Code Document](https://code.visualstudio.com/docs/java/java-tutorial#_creating-a-source-code-file)<br>
Java IntelliSense, debugging, testing, Maven/Gradle support, Lombok and more.<br>
- ![](https://img.shields.io/visual-studio-marketplace/i/oderwat.indent-rainbow?style=plastic)
[Indent-Rainbow](https://marketplace.visualstudio.com/items?itemName=oderwat.indent-rainbow) (oderwat: MIT)<br>
Makes indentation easier to read.
- ![](https://img.shields.io/visual-studio-marketplace/i/MS-CEINTL.vscode-language-pack-zh-hans?style=plastic)
(\*) [Language Pack](https://marketplace.visualstudio.com/search?target=vscode&category=Language%20Packs) (Microsoft: MIT) / [VS Code Document](https://code.visualstudio.com/docs/getstarted/locales)<br>
A language pack that matches the OS Locale.<br>
- ![](https://img.shields.io/visual-studio-marketplace/i/ritwickdey.LiveServer?style=plastic)
[Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) (Ritwick Dey: MIT)<br>
Launch a development local Server with live reload feature for static & dynamic pages.
- ![](https://img.shields.io/visual-studio-marketplace/i/mechatroner.rainbow-csv?style=plastic)
[Rainbow CSV](https://marketplace.visualstudio.com/items?itemName=mechatroner.rainbow-csv) (mechatroner: MIT)<br>
Highlight CSV and TSV files, Run SQL-like queries.
- ![](https://img.shields.io/visual-studio-marketplace/i/vmware.vscode-boot-dev-pack?style=plastic)
[Spring Boot Extension Pack](https://marketplace.visualstudio.com/items?itemName=vmware.vscode-boot-dev-pack) (Broadcom: EPL) / [VS Code Document](https://code.visualstudio.com/docs/java/java-spring-boot#_create-the-project)<br>
A collection of extensions for developing Spring Boot applications.<br>
- ![](https://img.shields.io/visual-studio-marketplace/i/Gruntfuggly.todo-tree?style=plastic)
[Todo Tree](https://marketplace.visualstudio.com/items?itemName=Gruntfuggly.todo-tree) (Gruntfuggly: MIT)<br>
Show TODO, FIXME, etc. comment tags in a tree view.
- ![](https://img.shields.io/visual-studio-marketplace/i/shardulm94.trailing-spaces?style=plastic)
[Trailing Spaces](https://marketplace.visualstudio.com/items?itemName=shardulm94.trailing-spaces) (Shardul Mahadik: MIT)<br>
Highlight trailing spaces and delete them in a flash!
- ![](https://img.shields.io/visual-studio-marketplace/i/redhat.vscode-xml?style=plastic)
[XML](https://marketplace.visualstudio.com/items?itemName=redhat.vscode-xml) (Red Hat: EPL)<br>
XML Language Support by Red Hat (pom.xml etc.).

<br>
<br>
<br>

# Recommended Extensions

The following are not included but are highly useful extensions. Consider installing them if needed.

- ![](https://img.shields.io/visual-studio-marketplace/i/sohamkamani.code-eol?style=plastic)
[code-eol 2022](https://marketplace.visualstudio.com/items?itemName=jeff-hykin.code-eol) (Jeff Hykin: MIT) / [code-eol](https://marketplace.visualstudio.com/items?itemName=sohamkamani.code-eol) (sohamkamani: Free)<br>
Display newline characters in your code. ([VSCode does not support CR](https://github.com/microsoft/vscode/issues?q=is%3Aissue+cr+lf+crlf+sort%3Aupdated-desc))
- ![](https://img.shields.io/visual-studio-marketplace/i/shengchen.vscode-checkstyle?style=plastic)
[Checkstyle](https://marketplace.visualstudio.com/items?itemName=shengchen.vscode-checkstyle) (ShengChen: GPL) / [VS Code Document](https://code.visualstudio.com/docs/java/java-linting#_checkstyle)<br>
Provide real-time feedback about Checkstyle violations and quick fix actions.
- ![](https://img.shields.io/visual-studio-marketplace/i/usernamehw.errorlens?style=plastic)
[Error Lens](https://marketplace.visualstudio.com/items?itemName=usernamehw.errorlens) (Phil Hindle: MIT)<br>
Improve highlighting of errors, warnings and other language diagnostics.
- ![](https://img.shields.io/visual-studio-marketplace/i/vsls-contrib.gistfs?style=plastic)
[GistPad](https://marketplace.visualstudio.com/items?itemName=vsls-contrib.gistfs) (Jonathan Carter: MIT)<br>
Manage your code snippets and developer notes using GitHub Gists and repositories.
- ![](https://img.shields.io/visual-studio-marketplace/i/s-nlf-fh.glassit?style=plastic)
[GlassIt-VSC](https://marketplace.visualstudio.com/items?itemName=s-nlf-fh.glassit) (hikarin522: MIT)<br>
VS Code Extension to set window to transparent on Windows and Linux platforms.
- ![](https://img.shields.io/visual-studio-marketplace/i/gengen0719.java-testingpair-opener?style=plastic)
[Java TestingPair Opener](https://marketplace.visualstudio.com/items?itemName=gengen0719.java-testingpair-opener) (gengen0719: Apache)<br>
This is an extension that opens JavaCode's TestingPair with a shortcut-key.
- ![](https://img.shields.io/visual-studio-marketplace/i/samuel-weinhardt.vscode-jsp-lang)
[JSP Language Support](https://marketplace.visualstudio.com/items?itemName=samuel-weinhardt.vscode-jsp-lang) (Samuel Weinhardt: MIT)<br>
JSP syntax highlighting for VS Code.
- ![](https://img.shields.io/visual-studio-marketplace/i/SonarSource.sonarlint-vscode?style=plastic)
[SonarLint](https://marketplace.visualstudio.com/items?itemName=SonarSource.sonarlint-vscode) (SonarSource: GPL) / [VS Code Document](https://code.visualstudio.com/docs/java/java-linting#_sonarlint)<br>
Detect and fix quality issues as you write code in C, C++, Java, JavaScript, PHP, Python, HTML and TypeScript.
- ![](https://img.shields.io/visual-studio-marketplace/i/rangav.vscode-thunder-client?style=plastic)
[Thunder Client](https://marketplace.visualstudio.com/items?itemName=rangav.vscode-thunder-client) (Ranga Vadhineni: Free)<br>
Lightweight Rest API Client for VS Code.
- ![](https://img.shields.io/visual-studio-marketplace/i/LalithK90.thymeleaf-html5-snippets?style=plastic)
[Thymeleaf HTML5 Snippets](https://marketplace.visualstudio.com/items?itemName=LalithK90.thymeleaf-html5-snippets) (Lalith Kahatapitiya: GPL)<br>
Most common thymeleaf code snippets for .html file.
- ![](https://img.shields.io/visual-studio-marketplace/i/sgruendel.thymeleaf-navigate?style=plastic)
[Thymeleaf Navigation](https://marketplace.visualstudio.com/items?itemName=sgruendel.thymeleaf-navigate) (Stefan Gründel: GPL)<br>
Navigate Thymeleaf 3 fragments.
<!--
- ![](https://img.shields.io/visual-studio-marketplace/i/redhat.vscode-community-server-connector?style=plastic)
[Community Server Connectors](https://marketplace.visualstudio.com/items?itemName=redhat.vscode-community-server-connector) (Red Hat: EPL) / [VS Code Document](https://code.visualstudio.com/docs/java/java-tomcat-jetty)<br>
This extension can start, stop, publish, and control servers such as Apache Felix, Karaf, and Tomcat..<br>
-->
<br>

Recommended Gradle/Maven plugins that supports Tomcat hot deployment.

- Gradle: [Gretty Plugin](https://github.com/gretty-gradle-plugin/gretty?tab=readme-ov-file)
- Maven: [Codehaus Cargo Plugin](https://codehaus-cargo.github.io/cargo/Maven+3+Plugin+Getting+Started.html)
