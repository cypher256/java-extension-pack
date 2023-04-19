# Java Extension Pack JDK Auto

[![GitHub Sponsor](https://img.shields.io/static/v1?label=Sponsor&message=%E2%9D%A4&logo=GitHub&color=ff69b4)](https://github.com/sponsors/cypher256)
![](https://github.com/cypher256/java-extension-pack/actions/workflows/eslint.yml/badge.svg)
![](https://img.shields.io/visual-studio-marketplace/d/Pleiades.java-extension-pack-jdk?color=yellow)
![](https://img.shields.io/visual-studio-marketplace/i/Pleiades.java-extension-pack-jdk?color=blue)
![](https://img.shields.io/visual-studio-marketplace/last-updated/Pleiades.java-extension-pack-jdk?color=orange)

Just install the extension and you can start Java development out of the box without installing JDK or setting the JAVA_HOME environment variables. Gradle/Maven tasks can be run from the Gradle/Maven view or the Command Palette. Note that the JAVA_HOME and PATH environment variables must be set when used on the command line.
<br>
<br>

# Features

## JDK Auto-configuration
The JDKs are auto-configured as follows on VSCode startup. If there are multiple JDKs of the same version, the latest minor version among them is used. To force a configuration update, run `Reload Window` from the Command Palette (Ctrl/Cmd + Shift + P).

1. Auto-fix invalid JDK configuration path (e.g. /jdk/bin/java -> /jdk)
1. Auto-remove configuration entries when JDK uninstalled or version path changed
1. Auto-scan JDKs from OS-specific default location, SDKMAN, jEnv, jabba, ASDF, etc...
1. Auto-detect environment variables JAVA_HOME, JDK_HOME and PATH
1. Auto-download Adoptium LTS JDKs and [available latest JDK](https://marketplace.visualstudio.com/items?itemName=redhat.java#features) if not installed
1. Auto-update auto-downloaded JDKs

|Configuration Name|Configured Value|
|---|---|
|`java.configuration.runtimes`|Set all JDKs scanned, detected, and downloaded|
|`java.home`|Delete due to deprecated entry|
|`java.jdt.ls.java.home`|Fix if unsupported old version (JDT)|
|`spring-boot.ls.java.home`|Fix if unsupported old version (ST4)|
|`maven.terminal.customEnv`|Set if JAVA_HOME environment variable not set|

<br>

### Auto-download Support
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

### e.g. Auto-configured User settings.json
```json
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
    "name": "JavaSE-16", // Oracle (Auto-scan)
    "path": "c:\\Program Files\\java\\jdk-16.0.2"
  },
  {
    "name": "JavaSE-17", // Adoptium (Auto-download)
    "path": "c:\\Users\\<UserName>\\AppData\\Roaming\\Code\\User\\globalStorage\\pleiades.java-extension-pack-jdk\\17",
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
"java.jdt.ls.java.home": "c:\\Users\\<UserName>\\AppData\\Roaming\\Code\\User\\globalStorage\\pleiades.java-extension-pack-jdk\\17",
```

The configured JDKs are available in the "Extension Pack for Java" feature below included in the extension.
<br>
<br>
<br>

# Java Version List for Project
To see which JDKs are used for your projects in multi-root workspaces, you can trigger the command `Configure Java Runtime` in Command Palette.
<br>
<p><img src="https://code.visualstudio.com/assets/docs/java/java-project/configure-project-runtime.png" style="max-width:600px"></p>

## Change JDK for Gradle and Maven projects
If you want to change the JDK version for your Gradle or Maven projects, you need to update it in your build scripts (build.gradle or pom.xml). You can click ⓘ to see how to make such changes. Click 🖊 will navigate to the build script file of the project.
<br>

## Change JDK for unmanaged folders
To change the JDK for unmanaged folders (with out any build tools), you can click the 🖊 button. It will list all the JDKs and you can select one for your unmanaged folders.
<br>
<br>
<br>

# License
- MIT (c) Shinji Kashihara
- Adoptium JDK: https://adoptium.net/docs/faq/

# Extensions Included

- [📦 Extension Pack for Java](https://marketplace.visualstudio.com/items?itemName=vscjava.vscode-java-pack) (Microsoft)<br>
IntelliSense, Refactoring, Debugger, Maven, Lombok, etc...<br>
License: MIT
- [📦 Gradle for Java](https://marketplace.visualstudio.com/items?itemName=vscjava.vscode-gradle) (Microsoft)<br>
Syntax highlighting, Task Panel, Run tasks<br>
License: MIT
- [📦 Spring Boot Extension Pack](https://marketplace.visualstudio.com/items?itemName=vmware.vscode-boot-dev-pack) (VMWare)<br>
Spring Initializr, Boot Dashboard, Properties Support<br>
License: EPL-1.0
- [📦 Community Server Connectors](https://marketplace.visualstudio.com/items?itemName=redhat.vscode-community-server-connector) (Red Hat)<br>
Servers Panel, Start/Stop (Tomcat, Glassfish, etc...), Server download and installation<br>
License: EPL-2.0
