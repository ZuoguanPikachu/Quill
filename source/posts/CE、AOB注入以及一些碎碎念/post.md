---
title: CE、AOB注入以及一些碎碎念
date: 2024-12-30 09:20:10
tags: [内存修改, CSharp, 杂谈]
categories: 编程
index_img: https://zuoguan-piclib-1257172707.cos.ap-guangzhou.myqcloud.com/assets/15.jpg
---

## 前言

最近又看了CE相关的教学视频[【从零学游戏逆向】CE入门教程](https://www.bilibili.com/video/BV1Eg4y1X7ey/)，这次，我觉得我学会了。仔细想想，以往其他的教程在寻找基址时，都是直接说先找“什么写入了内存”，再找“什么读取了内存”，并不会教汇编代码，也不解释为什么这么做。而这个教程有教一些简单的汇编代码，也讲了一些基础的原理。

于是，我便自己找了个游戏去练手。

## AOB注入

### 基本原理

1. 搜索注入点的字节码（Array of Bytes，AOB），这个字节码需要是唯一的，用于获得内存地址
2. 在指定地址写入自定义代码



### 用 C# 实现 AOB 注入功能

#### 案例1

原代码：

```assembly
ac_client.exe+C73EF: FF 08           - dec [eax]
ac_client.exe+C73F1: 8D 44 24 1C     - lea eax,[esp+1C]
```

其中`dec [eax]`就是子弹数减一。

想实现无限子弹的话，最简单的方法就是将这一行代码用空指令`nop`填充。所以方法就是搜索`FF 08 8D 44 24 1C`，获得内存地址（只搜`FF 08`大概率会有重复的），然后在该地址写入`90 90`，即两个`nop`。

C#实现：

1. 导入 Windows API

   ```c#
   [DllImport("kernel32.dll")]
   private static extern IntPtr OpenProcess(int dwDesiredAccess, bool bInheritHandle, int dwProcessId);
   
   [DllImport("kernel32.dll")]
   private static extern bool ReadProcessMemory(IntPtr hProcess, IntPtr lpBaseAddress, byte[] lpBuffer, uint nSize, out IntPtr lpNumberOfBytesRead);
   
   [DllImport("kernel32.dll")]
   private static extern bool WriteProcessMemory(IntPtr hProcess, IntPtr lpBaseAddress, byte[] lpBuffer, uint nSize, out IntPtr lpNumberOfBytesWritten);
   ```

2. 获取进程

   ```c#
   const int PROCESS_ALL_ACCESS = 0x1F0FFF;
   
   string processName = "ac_client";
   Process process = Process.GetProcessesByName(processName)[0];
   IntPtr hProcess = OpenProcess(PROCESS_ALL_ACCESS, false, process.Id);
   ```

3. 搜索字节码

   ```c#
   IntPtr FindPattern(IntPtr hProcess, Process process, byte[] pattern)
   {
       foreach (ProcessModule module in process.Modules)
       {
           IntPtr baseAddress = module.BaseAddress;
           int moduleSize = module.ModuleMemorySize;
           byte[] buffer = new byte[moduleSize];
   
           ReadProcessMemory(hProcess, baseAddress, buffer, (uint)moduleSize, out _);
           for (int i = 0; i < buffer.Length - pattern.Length; i++)
           {
               bool found = true;
               for (int j = 0; j < pattern.Length; j++)
               {
                   if (buffer[i + j] != pattern[j])
                   {
                       found = false;
                       break;
                   }
               }
   
               if (found)
               {
                   return baseAddress + i;
               }
           }
       }
   
       return IntPtr.Zero;
   }
   
   byte[] pattern = [0xFF, 0x08, 0x8D, 0x44, 0x24, 0x1C];
   IntPtr targetAddress = FindPattern(hProcess, process, pattern);
   ```

4. 注入

   ```c#
   byte[] injectCode = [0x90, 0x90];
   WriteProcessMemory(hProcess, targetAddress, injectCode, (uint)injectCode.Length, out _);
   ```

5. 取消注入

   ```c#
   WriteProcessMemory(hProcess, targetAddress, pattern, (uint)pattern.Length, out _);
   ```

#### 案例二

这个就是我拿来练手的游戏。原代码：

```assembly
PlagueExternal.SetEvoPoints+6:  8B 45 0C           - mov eax,[ebp+0C]
PlagueExternal.SetEvoPoints+9:  8B C8              - mov ecx,eax
PlagueExternal.SetEvoPoints+B:  2B 4A 04           - sub ecx,[edx+04]
PlagueExternal.SetEvoPoints+E:  01 8A C4 01 00 00  - add [edx+000001C4],ecx
PlagueExternal.SetEvoPoints+14: 89 42 04           - mov [edx+04],eax
```

`[ebp+0C]`是将要改变成的DNA数量，然后赋值给了`eax`、`ecx`。`[edx+04]`和`[edx+000001C4]`，都是当前的DNA数量（两者的异同没研究明白）。`ecx`与`[edx+04]`相减，得到变化值，然后加到`[edx+000001C4]`上；将`eax`赋值给`[edx+04]`。这样就完成了DNA数量的变化。

找不到DNA数量的基址，那就“曲线救国”，让进化的时候不消耗DNA。在`mov ecx,eax`处进行注入，比较`eax`和`[edx+04]`的大小，如果`eax`更大，就走正常流程，否则就将`eax`赋值为`[edx+04]`，然后走正常流程。这样就能实现DNA数量的只增不减。

显然，只在原处修改代码是无法实现的，需要新申请一块内存空间，在其中写入相关代码，在注入处跳转至新内存空间，再跳转回来。

![注入代码，跳转至新内存空间](./assets/image-20241230145247717.png)

![新内存空间内的代码](./assets/image-20241230150016568.png)

C#实现：

1. 导入 Windows API

   ```c#
   [DllImport("kernel32.dll")]
   private static extern IntPtr OpenProcess(int dwDesiredAccess, bool bInheritHandle, int dwProcessId);
   
   [DllImport("kernel32.dll")]
   private static extern bool ReadProcessMemory(IntPtr hProcess, IntPtr lpBaseAddress, byte[] lpBuffer, uint nSize, out IntPtr lpNumberOfBytesRead);
   
   [DllImport("kernel32.dll")]
   private static extern bool WriteProcessMemory(IntPtr hProcess, IntPtr lpBaseAddress, byte[] lpBuffer, uint nSize, out IntPtr lpNumberOfBytesWritten);
   
   // 申请内存
   [DllImport("kernel32.dll")]
   private static extern IntPtr VirtualAllocEx(IntPtr hProcess, IntPtr lpAddress, uint dwSize, uint flAllocationType, uint flProtect);
   
   // 释放内存
   [DllImport("kernel32.dll", SetLastError = true)]
   private static extern bool VirtualFreeEx(IntPtr hProcess, IntPtr lpAddress, uint dwSize, uint dwFreeType);
   ```

2. 获取进程

3. 搜索字节码

4. 注入

   * 申请内存

     ```c#
     const uint PAGE_EXECUTE_READWRITE = 0x40;
     IntPtr memAddress = VirtualAllocEx(hProcess, IntPtr.Zero, 0x1000, 4096, PAGE_EXECUTE_READWRITE);
     ```

   * 跳转至新内存空间

     ```c#
     byte[] jumpToNewMemCode = [
         0xE9, 0x00, 0x00, 0x00, 0x00, // jmp xxx
     ];
     // jmp 相对地址
     IntPtr relativeAddress = memAddress - (targetAddress + 5);
     BitConverter.GetBytes((int)relativeAddress).CopyTo(jumpToNewMemCode, 1);
     WriteProcessMemory(hProcess, targetAddress, jumpToNewMemCode, (uint)jumpToNewMemCode.Length, out _);
     ```

   * 新内存空间代码

     ```c#
     byte[] injectCode = [
         0x3B, 0x42, 0x04, // cmp eax,[edx+04]
         0x0F, 0x8F, 0x00, 0x00, 0x00, 0x00, // jg xxx
         0x8B, 0x42, 0x04, // mov eax,[edx+04]
         0x8B, 0xC8, // mov ecx,eax
         0x2B, 0x4A, 0x04, // sub ecx,[edx+04]
         0xE9, 0x00, 0x00, 0x00, 0x00, // jmp xxx
     ];
     // jg 相对地址
     // relativeAddress = (memAddress + 12) - (memAddress + 9);
     // relativeAddress = 3
     BitConverter.GetBytes(3).CopyTo(injectCode, 5);
     
     // jmp 相对地址
     relativeAddress = (targetAddress + jumpToNewMemCode.Length) - (memAddress + injectCode.Length);
     BitConverter.GetBytes((int)relativeAddress).CopyTo(injectCode, injectCode.Length - 4); // 填充 jmp 地址
     
     WriteProcessMemory(hProcess, memAddress, injectCode, (uint)injectCode.Length, out _);
     ```

   跳转相对地址的计算方法：目标地址 - 跳转指令（含相对地址）末尾的地址

5. 取消注入

   ```c#
   WriteProcessMemory(hProcess, targetAddress, pattern, (uint)pattern.Length, out _);
   
   const uint MEM_RELEASE = 0x8000;
   VirtualFreeEx(hProcess, memAddress, 0, MEM_RELEASE)
   ```

### 将汇编转换为16进制机器码

以上的16进制机器码，都是我从CE中抄来的。粗略地搜索了一下，C#中似乎并没有一个完善的库来实现这个功能，容我细细研究一下。

## 一些碎碎念

从我萌生了做游戏外挂的想法到今天，至少8年了。然而非常可惜，直到今天，我也才能、只能在这种不设防的、简单的单机游戏，完成一些简单的作弊。不过作为一个非专业人员，只是一个爱好者，可能也足够了？

回想一下，在“作弊”这一领域，我确实点了不少技能。

我个人觉得，我最强的领域大概就是爬虫了。不过这也只是对于我个人而言，在高手眼里，我可能很菜很菜。爬虫技术是真正帮我解决过大问题的。本科毕业有创分要求，对于一个不爱参加社团的社恐死宅来说，最好的获取创分的方法就是参加各种讲座。而讲座一般都分为预报名和现场报名。现场报名正式开始前的1~2小时就会有人开始排队，非常浪费时间，而且可能跟上课冲突。而预报名则是填问卷星，拼手速。人手速再快也不过程序啊。从我开始用爬虫抢预报名后，未尝一败。我应该有一半的创分都是这么来的。

有神经网络的加持，模拟领域也不错。学会训练、使用Yolo v5后，做过一个微信跳一跳的脚本，效果很不错。可惜的是，那时跳一跳已经不火了。还试过用图片分类网络判断原神里钓鱼的状态，从而实现半自动钓鱼。做的部落冲突辅助，也有一点深度神经网络在内。

内存修改领域，今天才算是入了门。

高三时，化学老师和我们说过，一些知识点，如果怎么搞都搞不懂，那就把它放一边，等你有了更丰富的知识储备后，再回来看，你会发现其实很简单。我还是挺认可这个说法的。一开始学爬虫的时候，真的是啥也不懂，也不明白教程里为什么那样做。而某一天，就像是突然开悟了一样，明白了教程里在讲什么、在做什么、为什么……以前学用CE找基址的时候，也是不明白为什么要那样做。现在，是慢慢理解了，还能看懂一些简单的汇编代码了。想来还是有点点感慨的。

