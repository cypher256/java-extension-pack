# Java Extension Pack JDK Auto

[![GitHub Sponsor](https://img.shields.io/static/v1?label=Sponsor&message=%E2%9D%A4&logo=GitHub&color=ff69b4)](https://github.com/sponsors/cypher256)
![](https://github.com/cypher256/java-extension-pack/actions/workflows/eslint.yml/badge.svg)
![](https://img.shields.io/visual-studio-marketplace/d/Pleiades.java-extension-pack-jdk?color=yellow)
![](https://img.shields.io/visual-studio-marketplace/i/Pleiades.java-extension-pack-jdk?color=blue)
![](https://img.shields.io/visual-studio-marketplace/last-updated/Pleiades.java-extension-pack-jdk?color=orange)

The extension greatly reduces the installation, configuration effort, and [JDK configuration errors](https://stackoverflow.com/search?q=vscode+jdk) for general Java developers. There is no need to manually install the JDK or set the JAVA_HOME environment variables. It also comes pre-included with extensions that most Java developers need, such as Maven, Gradle, Spring, Lombok, and Tomcat start/stop, so you can start developing right out of the box with zero configuration.
<br>
<br>
<br>

# Features

## JDK Auto-configuration
The JDKs are auto-configured for the current environment on VSCode startup as follows. If there are multiple JDKs of the same version, the latest minor version among them is used. If you manually install or update the JDK and want to force update the configuration of VSCode, restart VSCode or execute `Developer: Reload Window` from the command palette (Ctrl/Cmd + Shift + P). These are applied as user (VSCode global) settings. You can manually change user settings, but if you want to customize your settings even further, consider using [workspace settings](https://code.visualstudio.com/docs/getstarted/settings) or [profiles](https://code.visualstudio.com/docs/editor/profiles).

1. Auto-fix invalid JDK configuration path (e.g. /jdk17/bin/java -> /jdk17)
1. Auto-remove configuration entries when JDK uninstalled or version path changed
1. Auto-scan from OS-specific location, SDKMAN, jEnv, jabba, ASDF, Gradle, Scoop, IntelliJ etc...
1. Auto-detect environment variables JAVA_HOME, JDK_HOME and PATH
1. Auto-download Adoptium LTS JDKs and available latest non-LTS JDK if not installed
1. Auto-update auto-downloaded JDKs to the latest version

|Configuration Name|Configured Value (Priority Order)|
|---|---|
|(*1) [java.jdt.ls.java.home](https://github.com/redhat-developer/vscode-java/wiki/JDK-Requirements#platform-versions)<br>([Issues](https://github.com/redhat-developer/vscode-java/issues?q=is%3Aissue+java.jdt.ls.java.home))|Latest LTS (*2)<br>(Setting > JDK_HOME > JAVA_HOME > PATH)|
|(*1) [spring-boot.ls.java.home](https://github.com/spring-projects/sts4/blob/main/vscode-extensions/vscode-spring-boot/lib/Main.ts#L30)<br>([Issues](https://github.com/spring-projects/sts4/issues?q=is%3Aissue+spring-boot.ls.java.home))|Latest LTS (*2)<br>(Setting > JAVA_HOME > PATH)|
|(*1) [rsp-ui.rsp.java.home](https://github.com/redhat-developer/vscode-rsp-ui#extension-settings)<br>([Issues](https://github.com/redhat-developer/vscode-rsp-ui/issues?q=is%3Aissue+rsp-ui.rsp.java.home))|Latest LTS (*2)<br>(Setting > JDK_HOME > JAVA_HOME> Windows Registry > PATH)|
|[java.home](https://github.com/redhat-developer/vscode-java/wiki/JDK-Requirements#universal-version)|Delete due to deprecated entry|
|[java.configuration.runtimes](https://code.visualstudio.com/docs/java/java-project#_configure-runtime-for-projects)<br>([Issues](https://github.com/redhat-developer/vscode-java/issues?q=is%3Aissue+java.configuration.runtimes))|Set all major JDKs scanned, detected, and downloaded<br>(Setting > JAVA_HOME)|
|[java.import.gradle.java.home](https://marketplace.visualstudio.com/items?itemName=vscjava.vscode-gradle#java-specific-settings)<br>([Issues](https://github.com/microsoft/vscode-gradle/issues?q=is%3Aissue+java.import.gradle.java.home))|Set default if unset<br>(Setting > java.jdt.ls.java.home)|
|[maven.terminal.customEnv](https://marketplace.visualstudio.com/items?itemName=vscjava.vscode-maven#additional-configurations)<br>([Issues](https://github.com/microsoft/vscode-maven/issues?q=is%3Aissue+maven.terminal.customEnv))|Set default if JAVA_HOME environment variable unset<br>(Setting > JAVA_HOME)|

(*1) The language server runtime used by VSCode extensions. Not for building and running projects.<br>
(*2) Set latest LTS if unset, Fix if unsupported older version.
<br>
<br>

#### Auto-download Support
Up to 4 LTSs and the [latest available non-LTS](https://marketplace.visualstudio.com/items?itemName=redhat.java#features) will be auto-downloaded if not installed. Unused old non-LTS that were previously auto-downloaded can safely be removed manually from the directory. Auto-download is supported on the following platforms:
- Windows x64
- macos x64, aarch64
- Linux x64

|OS|Auto-downloaded JDK Location|
|---|---|
|Windows|%APPDATA%\Code\User\globalStorage\pleiades.java-extension-pack-jdk\ |
|macos|$HOME/Library/Application Support/Code/User/globalStorage/pleiades.java-extension-pack-jdk/|
|Linux|$HOME/.config/Code/User/globalStorage/pleiades.java-extension-pack-jdk/|

<br>

#### e.g. Auto-configured User settings.json
Command Palette ≫ `Preferences: Open User Settings (JSON)`
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
Terminal profiles are defined based on configured runtimes, so you can easily open a terminal by selecting the Java version from the terminal dropdown. The configured environment variables have no effect outside the terminal, so the system and OS user environment remain clean. The `JAVA_HOME` and `PATH` in the auto-configured terminal configuration will always be overridden from the configured runtimes, so if you want to customize it, copy the terminal configuration entry and create a new one.
<br><p>
![Switch Java Version](https://raw.githubusercontent.com/cypher256/java-extension-pack/main/image/terminal.png)
</p>

|Configuration Name|Configured Value (Order of priority)|
|---|---|
|[terminal.integrated.env.*](https://code.visualstudio.com/docs/terminal/profiles#_configuring-profiles)<br>([Issues](https://github.com/microsoft/vscode/issues?q=is%3Aissue+terminal.integrated.env+JAVA_HOME))|Set default if JAVA_HOME environment variable unset<br>(Setting > JAVA_HOME)|
|[terminal.integrated.defaultProfile.windows](https://code.visualstudio.com/docs/terminal/profiles)<br>([Issues](https://github.com/microsoft/vscode/issues?q=is%3Aissue+terminal.integrated.profiles))|Set "Command Prompt" if unset on Windows<br>default "PowerShell"|
|[terminal.integrated.profiles.*](https://code.visualstudio.com/docs/terminal/profiles)<br>([Issues](https://github.com/microsoft/vscode/issues?q=is%3Aissue+terminal.integrated.profiles))|Set configured runtimes to terminal|

#### e.g. Auto-configured User settings.json
Command Palette ≫ `Preferences: Open User Settings (JSON)`
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

## Language Pack Auto-installation
The language pack corresponding to the OS locale is installed at the first startup.
* cs, de, es, fr, it, ja, ko, pl, ru, tr, zh-hans or zh-hant

<br>

## Auto-default Settings
If the user settings is not set, it will auto-set the JDT Auto default value. Note that a debug run is required to enable Hot Code Replace (Hot Deploy).

|Configuration Name|VSCode default|JDT Auto default|
|---|---|---|
|[java.debug.settings.hotCodeReplace](https://code.visualstudio.com/docs/java/java-debugging#_hot-code-replace)|manual|auto|
|[workbench.tree.indent](https://code.visualstudio.com/docs/getstarted/settings#:~:text=in%20pixels.%0A%20%20%22-,workbench.tree.indent,-%22%3A%208)|8|20|

<br>

## License
- MIT (c) WILL Shinji Kashihara (cypher256)
- Adoptium JDK: https://adoptium.net/docs/faq/

<br>
<br>
<br>

# Included Extension Features
## Extension Pack for Java
Since many projects are nowadays using different Java versions in development, it is recommended to specify the Java version for each project instead of the `JAVA_HOME` environment variable so as not to affect the OS and OS user environment. To see which JDKs are used for your projects in multi-root workspaces, you can trigger the command `Java: Configure Java Runtime` in Command Palette. The [Configure Runtime for Projects](https://code.visualstudio.com/docs/java/java-project) view is a feature of the Extension Pack for Java (Microsoft).
<br><p>
![Configure Java Runtime](https://code.visualstudio.com/assets/docs/java/java-project/configure-project-runtime.png)
</p>

### Change JDK for Gradle and Maven projects
If you want to change the JDK version for your Gradle or Maven projects, you need to update it in your build scripts (build.gradle or pom.xml). You can click ⓘ to see how to make such changes. Click 🖊 will navigate to the build script file of the project. It is recommended that the Maven/Gradle version be set by project using `gradlew`/`mvnw` properties. For Spring Boot Gradle/Maven projects and general Gradle projects, these wrappers are included by default, so you don't need to install Gradle/Maven or set its environment variables.
<br>

### Change JDK for unmanaged folders
To change the JDK for unmanaged folders (with out any build tools), you can click the 🖊 button. It will list all the JDKs and you can select one for your unmanaged folders. This changes the `"default": true` for `java.configuration.runtimes`. Currently, it is <a href="https://github.com/redhat-developer/vscode-java/issues/2543">not possible to use different Java versions</a> in multiple unmanaged folders within the same workspace.
<br>
<br>

## Spring Boot Extension Pack
Set the JDK version when [creating a Spring Boot project](https://code.visualstudio.com/docs/java/java-spring-boot#_create-the-project) or in build.gradle/pom.xml.
<p>

![Spring Boot Dashboard](https://raw.githubusercontent.com/cypher256/java-extension-pack/main/image/spring.jpg)
</p>
<br>

## Community Server Connectors
The JDK used to run the server for Servlet and Jakarta EE applications can be specified from the context menu > `Edit Server` > `vm.install.path`.
<p>

![Servers View](https://raw.githubusercontent.com/cypher256/java-extension-pack/main/image/servers.jpg)
</p>
<br>

## Included Extensions List

- [📦 Extension Pack for Java](https://marketplace.visualstudio.com/items?itemName=vscjava.vscode-java-pack) (Microsoft: MIT)<br>
IntelliSense, Refactoring, Debugger, Maven, Lombok, etc...<br>
- [📦 Spring Boot Extension Pack](https://marketplace.visualstudio.com/items?itemName=vmware.vscode-boot-dev-pack) (VMWare: EPL-1.0)<br>
Spring Initializr, Boot Dashboard, Properties Support<br>
- [📦 Gradle for Java](https://marketplace.visualstudio.com/items?itemName=vscjava.vscode-gradle) (Microsoft: MIT)<br>
Syntax highlighting, Task Panel, Run tasks<br>
- [📦 Community Server Connectors](https://marketplace.visualstudio.com/items?itemName=redhat.vscode-community-server-connector) (Red Hat: EPL-2.0)<br>
Servers Panel, Start/Stop (Tomcat, Glassfish, etc...), Server download and installation<br>
- [📦 Language Pack](https://marketplace.visualstudio.com/search?target=VSCode&category=Language%20Packs) (Microsoft: MIT)<br>
A language pack that matches the OS Locale<br>
