---
title: Photoshop弹出软件未授权弹窗的解决方法
date: 2024-09-04 12:14:15
tags: [Photoshop, 防火墙, 代理]
categories: 计算机
index_img: https://zuoguan-piclib-1257172707.cos.ap-guangzhou.myqcloud.com/assets/9.jpg
---
最近我的Photoshop出现了未授权的弹窗

![弹窗](./assets/84d9803f798bb883db57cf3c716f581e79dbd444.jpg@1256w_978h_!web-article-pic.avif)

解决方法的基本思路就是阻止Photoshop联网。

## 防火墙
【控制面板】->【Windows Defender 防火墙】->【高级设置】->【出站规则】->【新建规则】->【程序，下一页】->【Photoshop.exe路径，下一页】->【阻止连接，下一页】->【全选，下一页】->【填写名称，完成】
![](./assets/image-20240904123826397.png)
![](./assets/image-20240904123931363.png)
![](./assets/image-20240904124011597.png)


## Clash
在使用Clash时，会绕过防火墙，导致上述方法失效，需要在Clash中配置规则。

【Clash】->【Settings】->【Profiles】->【Parsers】->【Edit】
```yaml
parsers:
  - url: 订阅链接
    yaml:
      prepend-rules:
        - PROCESS-NAME,Photoshop.exe,REJECT
```