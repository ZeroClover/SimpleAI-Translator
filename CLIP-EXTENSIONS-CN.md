桌面端应用全局划词插件
----------------------

<p align="center">
    <br> <a href="CLIP-EXTENSIONS.md">English</a> | 中文
</p>

划词翻译是本软件的核心功能。浏览器扩展可以通过浏览器提供的简单 API 获得选中的文本，但桌面端各操作系统都没有统一的 API 来获得选中的文本。

通过剪贴板获取选中文本会在一些应用中造成剪贴板混乱，在 macOS 中还会因为没有选中文本就按下 cmd+c 而发出警告声。各操作系统已经有成熟且插件机制完善的划词软件，所以 SimpleAI Translator 为它们提供了插件，让用户无痛地使用划词翻译。

桌面端应用本身不提供全局快捷键或划词监听。插件会把选中的文本发送给正在运行的应用，由应用打开翻译窗口并填入该文本：

-   PopClip（macOS）把文本发送到本地 socket `/tmp/simpleai-translator.sock`。如果应用未运行，插件会先启动应用，两秒后重试。
-   SnipDo（Windows）把文本发送到 `http://127.0.0.1:62007`。使用前请先启动 SimpleAI Translator。

# macOS

## PopClip

[PopClip](https://pilotmoon.com/popclip/) 是 macOS 上成熟的划词软件，它提供了完善的插件机制，我们提供了它的插件，安装步骤如下：

* 1. 下载并安装 [PopClip](https://pilotmoon.com/popclip/)
* 2. 下载 [SimpleAI-Translator.popclipextz](https://github.com/ZeroClover/SimpleAI-Translator/releases/latest/download/SimpleAI-Translator.popclipextz)
* 3. 双击下载完毕的 SimpleAI-Translator.popclipextz，点击弹出窗口中的 Install "SimpleAI Translator" 按钮即可安装完毕
    
    <p align="center">
        <img width="400" src="https://user-images.githubusercontent.com/1206493/240260692-8af6141a-3dba-4775-921d-505223addf9e.png" />
    </p>

* 4. 在 PopClip 中开启 SimpleAI Translator
    
    <p align="center">
        <img width="400" src="https://user-images.githubusercontent.com/1206493/240258859-c4f2ec91-255f-414c-a4a4-aca25fceb0b5.png" />
    </p>

* 5. 效果如下

    <p align="center">
        <img width="600" src="https://user-images.githubusercontent.com/1206493/240355949-8f41d98d-f097-4ce4-a533-af60e1757ca1.gif" />
    </p>

# Windows

## SnipDo

* 1. 下载并安装 [SnipDo](https://apps.microsoft.com/store/detail/snipdo/9NPZ2TVKJVT7)
* 2. 下载 [SimpleAI-Translator.pbar](https://github.com/ZeroClover/SimpleAI-Translator/releases/latest/download/SimpleAI-Translator.pbar)
* 3. 双击下载完毕的 SimpleAI-Translator.pbar 即可安装
* 4. 在 SnipDo 的设置页面中启用 SimpleAI Translator

    <p align="center">
        <img width="200" src="https://github.com/nextai-translator/nextai-translator/assets/1206493/09d66943-06db-4ba7-b217-a434c33cc8aa" />
    </p>

    建议只保留 SimpleAI Translator:
  
    <p align="center">    
        <img width="600" src="https://github.com/nextai-translator/nextai-translator/assets/1206493/76b619d9-e63d-4d67-a32c-a0d2d6923558" />
    </p>


* 5. 效果如下

    <p align="center">
        <img width="600" src="https://user-images.githubusercontent.com/1206493/240358161-2788eb97-d00b-4808-aa86-a7fcfe3f71dd.gif" />
    </p>

