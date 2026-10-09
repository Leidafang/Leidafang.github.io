"""Build a dependency-free, local-first research portfolio from curated content."""
import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = json.loads((ROOT / "content.json").read_text())
OUT = ROOT / "docs"
OUT.mkdir(exist_ok=True)
e = html.escape


def shell(title, body, active=""):
    draft = '<div class="draft-bar">本地草稿预览 <span>·</span> 公开素材待选定，尚未发布</div>' if DATA["draft"] else ""
    robots = '<meta name="robots" content="noindex,nofollow">' if DATA["draft"] else ""
    return f'''<!doctype html>
<html lang="{e(DATA['language'])}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{e(title)} · {e(DATA['name'])}</title><meta name="description" content="AI 与 CFD 研究记录：PINNs、DoMINO、GeoTransolver、神经算子与数据中心热环境预测。">{robots}
<link rel="stylesheet" href="style.css"></head><body>
<a class="skip" href="#main">跳转到内容</a>{draft}
<header class="header"><a class="brand" href="index.html">{e(DATA['name'])}<span>AI + CFD / 研究记录</span></a>
<nav aria-label="主导航"><a href="index.html#projects">项目</a><a href="index.html#notes">笔记</a><a href="index.html#about">关于</a><a href="{e(DATA['github'])}" target="_blank" rel="noopener noreferrer">GitHub ↗</a></nav></header>
<main id="main">{body}</main>
<footer><span>© 2026 {e(DATA['name'])} · AI + CFD</span><span>以问题为起点，以证据为依据。</span></footer></body></html>'''


def tags(items):
    return '<div class="tags">' + ''.join(f'<span>{e(t)}</span>' for t in items) + '</div>'


projects = [a for a in DATA['articles'] if a['type'] == 'project']
notes = [a for a in DATA['articles'] if a['type'] == 'note']
cards = ''.join(f'''<a class="project-card" href="{e(a['slug'])}.html"><div class="card-top"><span>{e(a['category'])}</span><b>{e(a['number'])}</b></div><h3>{e(a['title'])}</h3><p>{e(a['summary'])}</p>{tags(a['tags'])}<span class="read">阅读项目记录 <span aria-hidden="true">↗</span></span></a>''' for a in projects)
rows = ''.join(f'''<a class="note-row" href="{e(a['slug'])}.html"><span class="note-no">{e(a['number'])}</span><div><span class="eyebrow">{e(a['category'])}</span><h3>{e(a['title'])}</h3><p>{e(a['summary'])}</p></div><span class="note-arrow" aria-hidden="true">↗</span></a>''' for a in notes)
home = f'''
<section class="hero"><div class="hero-copy"><p class="eyebrow">RESEARCH PORTFOLIO · 研究与实践</p><h1>从物理方程，<br>到可复用的<br><span>流场预测。</span></h1><p class="hero-intro">记录我在 AI 与计算流体力学交叉方向的探索：<br class="desktop-break">从 PINNs 圆柱绕流，到几何感知模型与数据中心热环境预测。</p><div class="hero-actions"><a class="button" href="#projects">浏览研究项目 <span aria-hidden="true">↓</span></a><a class="text-link" href="#notes">阅读技术笔记 ↗</a></div></div>
<aside class="path-panel" aria-label="研究路径"><div class="panel-heading"><span>研究路径</span><span class="tiny-label">QUESTION → METHOD</span></div><div class="path-item"><span>01</span><div><h2>从方程出发</h2><p>PINNs · 坐标表示 · 自动微分</p><small>已知物理，能否替代内部流场标签？</small></div></div><div class="path-item"><span>02</span><div><h2>走向一族问题</h2><p>DoMINO · GeoTransolver · FNO</p><small>几何与工况，怎样进入模型？</small></div></div><div class="path-item"><span>03</span><div><h2>回到工程场景</h2><p>数据中心 · 稳态与瞬态</p><small>预测如何被验证，又如何用于分析？</small></div></div><p class="panel-foot">实践案例 / 模型研读 / 方法反思</p></aside></section>
<section id="projects" class="section"><div class="section-heading"><div><p class="eyebrow">SELECTED WORK</p><h2>代表项目与方法研究</h2></div><p>问题、方法、结果与局限，<br>放在同一条叙事中。</p></div><div class="project-grid">{cards}</div></section>
<section id="notes" class="section notes"><div class="section-heading"><div><p class="eyebrow">RESEARCH NOTES</p><h2>把理解写清楚</h2></div><p>记录结论，也保留形成结论的过程。</p></div><div class="note-list">{rows}</div></section>
<section id="about" class="about"><div><p class="eyebrow">ABOUT THIS WORK</p><h2>关注方法，<br>也关注适用边界。</h2></div><div><p>我关注如何将物理建模、神经网络与工程验证结合起来，研究空间场预测、跨工况泛化，以及稳态与瞬态任务之间的联系。</p><p>这里持续整理项目实践与研究思考。方法研读、亲自完成的实验和仍待验证的判断会分别说明；模型结构图、实验结果与来源将随公开材料逐步补充。</p><a class="text-link" href="{e(DATA['github'])}" target="_blank" rel="noopener noreferrer">在 GitHub 找到我 ↗</a></div></section>
'''
(OUT / 'index.html').write_text(shell('AI + CFD 研究主页', home))
for article in DATA['articles']:
    sections = ''.join('<section class="article-section"><h2>' + e(s['title']) + '</h2>' + ''.join('<p>' + e(p) + '</p>' for p in s['paragraphs']) + '</section>' for s in article['sections'])
    references = ''.join(f'<li><a href="{e(r["url"])}" target="_blank" rel="noopener noreferrer">{e(r["title"])} ↗</a></li>' for r in article['references'])
    body = f'''<article class="article"><a class="back" href="index.html#{'projects' if article['type']=='project' else 'notes'}">← 返回{'项目' if article['type']=='project' else '笔记'}</a><header class="article-head"><p class="eyebrow">{e(article['category'])}</p><h1>{e(article['title'])}</h1><p class="lead">{e(article['lead'])}</p>{tags(article['tags'])}</header>{sections}<section class="references"><h2>延伸阅读与来源</h2><ul>{references}</ul><p class="source-note">本文记录个人实践与方法理解；以上链接为公开方法来源。页面将随研究进展持续更新。</p></section></article>'''
    (OUT / (article['slug'] + '.html')).write_text(shell(article['title'], body))
(OUT / 'style.css').write_text((ROOT / 'style.css').read_text())
(OUT / '.nojekyll').write_text('')
(OUT / 'robots.txt').write_text('User-agent: *\nDisallow: /\n' if DATA['draft'] else 'User-agent: *\nAllow: /\n')
print(f"Built {len(DATA['articles']) + 1} pages in {OUT}")
