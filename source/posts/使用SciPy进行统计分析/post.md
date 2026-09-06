---
title: 使用SciPy进行统计分析
date: 2023-05-22 09:03:51
tags: [统计, Python]
categories: 编程
index_img: https://zuoguan-piclib-1257172707.cos.ap-guangzhou.myqcloud.com/assets/4.jpg
math: true
---
`scipy.stats`提供了许多统计检验方法
* 单样本t检验
    ```python
    scipy.stats.ttest_1samp(a, popmean, axis=0, nan_policy='propagate', alternative="two-sided")
    ```

* 配对样本t检验
    ```python
    scipy.stats.ttest_rel(a, b, axis=0, nan_policy='propagate', alternative="two-sided")
    ```

* 两独立样本t检验
    ```python
    scipy.stats.ttest_ind(
        a, b, axis=0, equal_var=True, nan_policy='propagate',permutations=None,
        random_state=None, alternative="two-sided", trim=0
    )
    ```

* 完全随机设计的方差分析
    ```python
    scipy.stats.f_oneway(*samples, axis=0)
    ```

* 随机区组设计的方差分析
    在`scipy.stats`中似乎未提供可使用的函数，我尝试实现了一下，水平有限且一般使用用不到高维度的数据，所以仅支持1维的数据。
    ```python
    import numpy
    from scipy import special


    def f_twoway(*samples):
        all_data = numpy.asarray(samples)
        k, m = all_data.shape
        
        # 计算均值，exp：各处理组，block：各处理组
        total_avg = all_data.mean()
        exp_avgs = all_data.mean(1)
        block_avgs = all_data.mean(0)
        
        # 计算平方和，err：误差
        total_ss = numpy.power(all_data - total_avg, 2).sum()
        exp_ss = (numpy.power(exp_avgs - total_avg, 2)*m).sum()
        block_ss = (numpy.power(block_avgs - total_avg, 2)*k).sum()
        err_ss = total_ss - exp_ss - block_ss
        
        # 计算均方
        exp_ms = exp_ss/(k-1)
        err_ms = err_ss/((k-1)*(m-1))
        
        # 计算F值与P值
        statistic = exp_ms/err_ms
        p_value = special.fdtrc(k-1, (k-1)*(m-1), statistic)
    
        return statistic, p_value
    ```

* 卡方检验
    ```python
    scipy.stats.chi2_contingency(observed, correction=True, lambda_=None)
    ```
    `observed`: 表格
    
    |        | state1 | state2 |
    | :----: | :----: | :----: |
    | group1 |   a    |   b    |
    | group2 |   c    |   d    |
    
    ```python
    observed = [
        [a, b],
        [c, d],
    ]
    ```
    
* Fisher确切概率法
    ```python
    scipy.stats.fisher_exact(table, alternative='two-sided')
    ```

* 配对设计资料的符号秩和检验
    ```python
    scipy.stats.wilcoxon(
        x, y=None, zero_method="wilcox", correction=False,
        alternative="two-sided", method='auto'
    )
    ```

* 两独立样本的符号秩和检验
    ```python
    scipy.stats.mannwhitneyu(
        x, y, use_continuity=True, alternative="two-sided",
        axis=0, method="auto"
    )
    ```
    该函数返回的是检验统计量$U$，然而，我们一般更倾向使用统计量$Z$，其计算公式如下

    $$z = \frac{U-m_{U}}{\sigma_{U}}$$

    其中，$m_{U} = \frac{n_{1}n_{2}}{2}, \sigma_{U}=\sqrt{\frac{n_{1} n_{2}\left(n_{1}+n_{2}+1\right)}{12}-\frac{n_{1} n_{2} \sum_{k=1}^{K}\left(t_{k}^{3}-t_{k}\right)}{12 n(n-1)}}$

    其中，$n_{1}, n_{2}$分别为两组样本的样本数，$n = n_{1} + n_{2}$。$t_{k}$指并列第$k$的个数。
    当不存在并列的情况时，$\sigma_{U}$可以简化为$\sigma_{U} = \sqrt{\frac{n_{1} n_{2}\left(n_{1}+n_{2}+1\right)}{12}}$

    通过如下代码，即可算出统计量$Z$：
    ```python
    from collections import Counter
    
    n1 = len(samples1)
    n2 = len(samples2)
    
    # 将两组样本合并，用Counter计算每一个值的个数
    counter = Counter(samples1 + samples2)
    
    # 计算与并列相关的那一项
    sigma_ties = sum(map(lambda item: item**3-item, counter.values()))
    sigma_ties = (sigma_ties*n1*n2) / (12*(n1+n2)*(n1+n2-1))
    sigma_ties = (n1*n2*(n1+n2+1)/12 - sigma_ties)**0.5
    
    # 计算统计量Z
    z = (statistic - n1*n2*0.5) / sigma_ties
    ```

* 多个独立样本的符合秩和检验
    ```python
    scipy.stats.kruskal(*samples, nan_policy='propagate'):
    ```