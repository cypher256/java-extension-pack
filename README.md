# Java Extension Pack JDK Bundle

Just install this extension and you can start Java development out of the box without installing JDK or setting environment variables.
<br>
<br>

# Features

## Auto-configuration multiple JDK versions
Installing this extension downloads the Adoptium LTS JDKs and automatically configures the Java Runtime user setting. It also download automatically when the JDKs are updated.

|Setting Name|Auto-Configuration|
|---|---|
|`java.configuration.runtimes`|JDK 8, 11, 17 in this extension|
|`java.jdt.ls.java.home`|JDK 17 in this extension|
|`java.home`|Remove due to deprecated|

```json
// User settings.json
"java.configuration.runtimes": [
  {
    "name": "JavaSE-1.8",
    "path": "c:\\Users\\<UserName>\\AppData\\Roaming\\Code\\User\\globalStorage\\pleiades.java-extension-pack-jdk\\8"
  },
  {
    "name": "JavaSE-11",
    "path": "c:\\Users\\<UserName>\\AppData\\Roaming\\Code\\User\\globalStorage\\pleiades.java-extension-pack-jdk\\11"
  },
  {
    "name": "JavaSE-17",
    "path": "c:\\Users\\<UserName>\\AppData\\Roaming\\Code\\User\\globalStorage\\pleiades.java-extension-pack-jdk\\17",
    "default": true
  },
],
"java.jdt.ls.java.home": "c:\\Users\\<UserName>\\AppData\\Roaming\\Code\\User\\globalStorage\\pleiades.java-extension-pack-jdk\\17",
```

The configured JDKs are available in the following 'Extension Pack for Java' features.
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
The JDK to be downloaded depends on the OS and architecture.
- Windows x64
- macos x64, aarch64
- Linux x64
<br>
<br>

# License
- This extension: MIT
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
