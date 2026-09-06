---
title: 删除打开方式中的多余项
date: 2024-11-28 17:53:58
tags: [Windows, 注册表]
categories: 计算机
index_img: https://zuoguan-piclib-1257172707.cos.ap-guangzhou.myqcloud.com/assets/13.jpg
---

## 特定文件

1. 打开注册表

2. 来到`计算机\HKEY_CURRENT_USER\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.文件后缀名\OpenWithList`

3. 在右侧窗口删除多余项即可。

   ![image-20241128183922877](./assets/image-20241128183922877.png)

## 打开方式 - 更多应用

1. 打开注册表

2. 来到`计算机\HKEY_CURRENT_USER\SOFTWARE\Classes\Applications`

3. 删除其下的多余项

   ![image-20241128184303381](./assets/image-20241128184303381.png)

