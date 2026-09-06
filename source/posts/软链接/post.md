---
title: 软链接
date: 2024-08-21 14:38:35
tags: Windows
categories: 计算机
index_img: https://zuoguan-piclib-1257172707.cos.ap-guangzhou.myqcloud.com/assets/8.jpg
---
第一次了解到软链接，是在这个视频：[黑科技？你不知道的一种快捷方式，没有空间占用。在这种快捷方式面前，普通的快捷方式都是弟弟](https://www.bilibili.com/video/BV1Ct411P7ma/)。

最近，电脑的C盘又红了，就想着把一些大文件移到D盘，然后再用软链接映射回C盘原本的位置。但是PowerShell里没有mklink这个命令，需要用`New-Item`，遂记录一下。

现在我将`C:\Users\zuoguan\.nuget`剪切至`D:\.nuget`

创建软链接：

```powershell
New-Item -ItemType SymbolicLink -Path "C:\Users\zuoguan\.nuget" -Target "D:\.nuget"
```