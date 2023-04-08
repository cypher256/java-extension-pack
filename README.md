# Java Extension Pack JDK Bundle

Just install the extension and you can start Java development out of the box without installing JDK or setting environment variables. Gradle/Maven tasks can be run from the Gradle/Maven view or the Command Palette. Note that PATH environment variables and other settings are required when using it on the command line.
<br>
<br>

# Features

## Auto-configuration multiple JDK versions
At startup, it is auto-configured as follows. If the same major version has different minor versions, the latest version is set.

1. Auto-scan JDKs from each OS installation directory, SDKMAN, jEnv, jabba, ASDF, etc...
1. Auto-detect environment variables JAVA_HOME, JDK_HOME and PATH
1. Auto-download Adoptium LTS JDKs and [available latest JDK](https://github.com/redhat-developer/vscode-java#features) if not installed
1. Auto-update automatically downloaded managed JDKs
1. Auto-configure user settings (Delete entries where JDK does not exist)

|Configuration Name|Configured Value|
|---|---|
|`java.configuration.runtimes`|Auto-scanned and auto-downloaded JDKs|
|`java.jdt.ls.java.home`|Suitable JDK for JDT Language Server|
|`java.home`|Delete as deprecated|
|`maven.terminal.customEnv`|Set `JAVA_HOME` if environment variable JAVA_HOME not set|

```json
// ex: Auto-configured User settings.json
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
    "default": true
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

## Java Project Runtime Information
To see which JDKs are used for your projects in multi-root workspaces, you can trigger the command `Configure Java Runtime` in Command Palette (Ctrl/Cmd + Shift + P).
<br>
<p><img src="https://code.visualstudio.com/assets/docs/java/java-project/configure-project-runtime.png" style="max-width:600px"></p>
<br>

## Change JDK for Gradle and Maven projects
If you want to change the JDK version for your Gradle or Maven projects, you need to update it in your build scripts (build.gradle or pom.xml). You can click ⓘ to see how to make such changes. Click 🖊 will navigate to the build script file of the project.
<br>
<br>

## Change JDK for unmanaged folders
To change the JDK for unmanaged folders (with out any build tools), you can click the 🖊 button. It will list all the JDKs and you can select one for your unmanaged folders.
<br>
<br>

# Supported Platforms
The JDK downloaded depends on the OS and architecture.
- Windows x64
- macos x64, aarch64
- Linux x64
<br>
<br>

# License
- The extension: MIT
- Adoptium JDK: https://adoptium.net/docs/faq/
<br>
<br>

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
