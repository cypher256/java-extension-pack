# Java Extension Pack JDK Auto

[![GitHub Sponsor](https://img.shields.io/static/v1?label=Sponsor&message=%E2%9D%A4&logo=GitHub&color=ff69b4)](https://github.com/sponsors/cypher256)
![](https://github.com/cypher256/java-extension-pack/actions/workflows/eslint.yml/badge.svg)
![](https://img.shields.io/visual-studio-marketplace/d/Pleiades.java-extension-pack-jdk?color=yellow)
![](https://img.shields.io/visual-studio-marketplace/i/Pleiades.java-extension-pack-jdk?color=blue)
![](https://img.shields.io/visual-studio-marketplace/last-updated/Pleiades.java-extension-pack-jdk?color=orange)

There is no need to manually install the JDK or set the JAVA_HOME environment variables. It also includes extensions that most Java developers need, such as Maven, Gradle, Spring, Lombok, and Tomcat start/stop, and usually does not require additional Java extensions.
<br>
<br>

# Features

## JDK Auto-configuration
The JDKs are auto-configured for the current environment on VSCode startup as follows. If there are multiple JDKs of the same version, the latest minor version among them is used. To force a configuration update, run `Reload Window` from the Command Palette (Ctrl/Cmd + Shift + P).

1. Auto-fix invalid JDK configuration path (e.g. /jdk/bin/java -> /jdk)
1. Auto-remove configuration entries when JDK uninstalled or version path changed
1. Auto-scan JDKs from OS-specific location, SDKMAN, jEnv, jabba, ASDF, Gradle, Scoop, etc...
1. Auto-detect environment variables JAVA_HOME, JDK_HOME and PATH
1. Auto-download Adoptium LTS JDKs and [available latest JDK](https://marketplace.visualstudio.com/items?itemName=redhat.java#features) if not installed
1. Auto-update auto-downloaded JDKs to the latest version

|Configuration Name|Issues|Configured Value|
|---|---|---|
|(*) [java.jdt.ls.java.home](https://github.com/redhat-developer/vscode-java/wiki/JDK-Requirements#platform-versions)|[Issues](https://github.com/redhat-developer/vscode-java/issues?q=is%3Aissue+java.jdt.ls.java.home)|Set latest LTS if unset, Fix if unsupported older version (This > JDK_HOME > JAVA_HOME > PATH)|
|(*) [spring-boot.ls.java.home](https://github.com/spring-projects/sts4/blob/main/vscode-extensions/vscode-spring-boot/lib/Main.ts#L30)|[Issues](https://github.com/spring-projects/sts4/issues?q=is%3Aissue+spring-boot.ls.java.home)|Set latest LTS if unset, Fix if unsupported older version (This > JAVA_HOME > PATH)|
|[java.home](https://github.com/redhat-developer/vscode-java/wiki/JDK-Requirements#universal-version)||Delete due to deprecated entry|
|[java.configuration.runtimes](https://code.visualstudio.com/docs/java/java-project#_configure-runtime-for-projects)|[Issues](https://github.com/redhat-developer/vscode-java/issues?q=is%3Aissue+java.configuration.runtimes)|Set all major JDKs scanned, detected, and downloaded (This > JAVA_HOME)|
|[java.import.gradle.java.home](https://marketplace.visualstudio.com/items?itemName=vscjava.vscode-gradle#java-specific-settings)|[Issues](https://github.com/microsoft/vscode-gradle/issues?q=is%3Aissue+java.import.gradle.java.home)|Set default if unset (This > java.jdt.ls.java.home)|
|[maven.terminal.customEnv](https://marketplace.visualstudio.com/items?itemName=vscjava.vscode-maven#additional-configurations)|[Issues](https://github.com/microsoft/vscode-maven/issues?q=is%3Aissue+maven.terminal.customEnv)|Set default if JAVA_HOME environment variable unset (This > JAVA_HOME)|

(*) A runtime for VSCode extensions. Not for building and running projects.
<br>
<br>

#### Auto-download Support
Auto-download is supported on the following platforms:
- Windows x64
- macos x64, aarch64
- Linux x64

|OS|Auto-downloaded JDK Location|
|---|---|
|Windows|%APPDATA%\Code\User\globalStorage\pleiades.java-extension-pack-jdk\ |
|macos|$HOME/Library/Application Support/Code/User/globalStorage/pleiades.java-extension-pack-jdk/|
|Linux|$HOME/.config/Code/User/globalStorage/pleiades.java-extension-pack-jdk/|

<br>

#### e.g. Auto-configured User settings.json (Runtime for VSCode extension)
```json
// JDT Language Server
"java.jdt.ls.java.home": "c:\\Program Files\\java\\jdk-17.0.6",
// ST4 Language Server
"spring-boot.ls.java.home": "c:\\Program Files\\java\\jdk-17.0.6",
```
#### e.g. Auto-configured User settings.json (For building and running projects)
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
Terminal profiles are defined based on configured runtimes, so you can easily open a terminal by selecting the Java version from the terminal dropdown.
<br><p>
![Switch Java Version](https://raw.githubusercontent.com/cypher256/java-extension-pack/main/image/terminal.png)
</p>

|Configuration Name|Issue|Configured Value|
|---|---|---|
|[terminal.integrated.env.*](https://code.visualstudio.com/docs/terminal/profiles#_configuring-profiles)|[Issues](https://github.com/microsoft/vscode/issues?q=is%3Aissue+terminal.integrated.env+JAVA_HOME)|Set default if JAVA_HOME environment variable unset (This > JAVA_HOME)|
|[terminal.integrated.profiles.*](https://code.visualstudio.com/docs/terminal/profiles)|[Issues](https://github.com/microsoft/vscode/issues?q=is%3Aissue+terminal.integrated.profiles)|Set configured runtimes to terminal|

#### e.g. Auto-configured User settings.json
```json
// Terminal Default Environment Variables
"terminal.integrated.env.windows": {
  "JAVA_HOME": "c:\\Program Files\\java\\jdk-17.0.6",
  "PATH": "c:\\Program Files\\java\\jdk-17.0.6\\bin;${env:PATH}"
},
// Terminal Dropdown
"terminal.integrated.profiles.windows": {
  "JavaSE-1.8": {
      "path": "powershell",
      "env": {
          "JAVA_HOME": "c:\\Users\\<UserName>\\AppData\\Roaming\\Code\\User\\globalStorage\\pleiades.java-extension-pack-jdk\\8",
          "PATH": "c:\\Users\\<UserName>\\AppData\\Roaming\\Code\\User\\globalStorage\\pleiades.java-extension-pack-jdk\\8\\bin;${env:PATH}"
      },
      "overrideName": true
  },
  "JavaSE-11": {
      "path": "powershell",
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
<br>

# Extension Pack for Java Features
The configured JDKs are available in the "Extension Pack for Java" feature below included in this extension. To see which JDKs are used for your projects in multi-root workspaces, you can trigger the command `Configure Java Runtime` in Command Palette.
<br>
<p><img src="https://code.visualstudio.com/assets/docs/java/java-project/configure-project-runtime.png" style="max-width:600px"></p>

### Change JDK for Gradle and Maven projects
If you want to change the JDK version for your Gradle or Maven projects, you need to update it in your build scripts (build.gradle or pom.xml). You can click ⓘ to see how to make such changes. Click 🖊 will navigate to the build script file of the project.
<br>

### Change JDK for unmanaged folders
To change the JDK for unmanaged folders (with out any build tools), you can click the 🖊 button. It will list all the JDKs and you can select one for your unmanaged folders.
<br>
<br>
<br>

# License
- MIT (c) WILL Shinji Kashihara (cypher256)
- Adoptium JDK: https://adoptium.net/docs/faq/

# Extensions Included

- [📦 Extension Pack for Java](https://marketplace.visualstudio.com/items?itemName=vscjava.vscode-java-pack) (Microsoft)<br>
IntelliSense, Refactoring, Debugger, Maven, Lombok, etc...<br>
License: MIT
- [📦 Spring Boot Extension Pack](https://marketplace.visualstudio.com/items?itemName=vmware.vscode-boot-dev-pack) (VMWare)<br>
Spring Initializr, Boot Dashboard, Properties Support<br>
License: EPL-1.0
- [📦 Gradle for Java](https://marketplace.visualstudio.com/items?itemName=vscjava.vscode-gradle) (Microsoft)<br>
Syntax highlighting, Task Panel, Run tasks<br>
License: MIT
- [📦 Community Server Connectors](https://marketplace.visualstudio.com/items?itemName=redhat.vscode-community-server-connector) (Red Hat)<br>
Servers Panel, Start/Stop (Tomcat, Glassfish, etc...), Server download and installation<br>
License: EPL-2.0
