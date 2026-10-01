Desktop Application Global Clip Extensions
------------------------------------------

<p align="center">
    <br> English | <a href="CLIP-EXTENSIONS-CN.md">中文</a>
</p>

Selection translation is a core feature of this software. Browser extensions can read the selected text through a simple browser API, but desktop operating systems have no unified API for reading the selected text.

Reading the selection through the clipboard can clutter the clipboard in some applications, and on macOS it triggers a warning sound when cmd+c is pressed with nothing selected. Mature text-selection tools with good plug-in mechanisms already exist for each operating system, so SimpleAI Translator provides plug-ins for them to make selection translation painless.

The desktop app has no global shortcut or selection monitor of its own. The plug-ins send the selected text to the running app, which opens the translator window with that text:

-   PopClip (macOS) sends the text to the local socket `/tmp/simpleai-translator.sock`. If the app is not running, the plug-in starts it and retries after two seconds.
-   SnipDo (Windows) sends the text to `http://127.0.0.1:62007`. Start SimpleAI Translator before using it.

# macOS

## PopClip

[PopClip](https://pilotmoon.com/popclip/) is a well-established clip word software on macOS, it provides a perfect plug-in mechanism, we provide its plug-in, the installation steps are as follows:

* 1. Download and install [PopClip](https://pilotmoon.com/popclip/)
* 2. Download [SimpleAI-Translator.popclipextz](https://github.com/ZeroClover/SimpleAI-Translator/releases/latest/download/SimpleAI-Translator.popclipextz)
* 3. Double-click the downloaded SimpleAI-Translator.popclipextz and click the Install "SimpleAI Translator" button in the popup window to finish the installation
    
    <p align="center">
        <img width="400" src="https://user-images.githubusercontent.com/1206493/240260692-8af6141a-3dba-4775-921d-505223addf9e.png" />
    </p>

* 4. Enable SimpleAI Translator in PopClip
    
    <p align="center">
        <img width="400" src="https://user-images.githubusercontent.com/1206493/240258859-c4f2ec91-255f-414c-a4a4-aca25fceb0b5.png" />
    </p>

* 5. The effect is as follows

    <p align="center">
        <img width="600" src="https://user-images.githubusercontent.com/1206493/240355949-8f41d98d-f097-4ce4-a533-af60e1757ca1.gif" />
    </p>

# Windows

## SnipDo

* 1. Download and install [SnipDo](https://apps.microsoft.com/store/detail/snipdo/9NPZ2TVKJVT7)
* 2. Download [SimpleAI-Translator.pbar](https://github.com/ZeroClover/SimpleAI-Translator/releases/latest/download/SimpleAI-Translator.pbar)
* 3. Double-click the downloaded SimpleAI-Translator.pbar to install it
* 4. Enable SimpleAI Translator in SnipDo's settings page
    <p align="center">
        <img width="200" src="https://github.com/nextai-translator/nextai-translator/assets/1206493/09d66943-06db-4ba7-b217-a434c33cc8aa" />
    </p>

    Suggest to only keep SimpleAI Translator:
  
    <p align="center">    
        <img width="600" src="https://github.com/nextai-translator/nextai-translator/assets/1206493/76b619d9-e63d-4d67-a32c-a0d2d6923558" />
    </p>
    
* 5. The effect is as follows

    <p align="center">
        <img width="600" src="https://user-images.githubusercontent.com/1206493/240358161-2788eb97-d00b-4808-aa86-a7fcfe3f71dd.gif" />
    </p>

