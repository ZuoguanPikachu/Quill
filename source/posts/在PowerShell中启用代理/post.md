---
title: 在PowerShell中启用代理
date: 2024-11-11 19:23:36
tags: [代理, Powershell]
categories: 计算机
index_img: https://zuoguan-piclib-1257172707.cos.ap-guangzhou.myqcloud.com/assets/11.jpg
---
在`$PROFILE`中添加如下代码：
```powershell
function Enable-Proxy {
    $internet_setting = Get-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings'
    if ($internet_setting.ProxyEnable -eq 1) {
        $env:HTTP_PROXY = "http://$($internet_setting.ProxyServer)"
        $env:HTTPS_PROXY = "http://$($internet_setting.ProxyServer)"
    }
    Remove-Variable -Name internet_setting
}

Enable-Proxy
```
启动终端时，如果代理已开启，则会在PowerShell中启用代理。

如果启动时未开启，可在开启后执行以下命令
```powershell
Enable-Proxy
```