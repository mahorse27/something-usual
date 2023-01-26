import gradio as gr
import json
import os
import pandas as pd
from modules import script_callbacks,scripts

path="extensions/maple-from-fall-and-flower/scripts"
# path="."

with open(path+"/search.json") as search:
    search = json.load(search)
with open(path+"/tags.json") as tags:
    tags = json.load(tags)
with open(path+"/storage.json", "w", encoding="utf-8") as storage:
    storage.write("[]")

choli=["常用 优化Tag","常用 其他Tag","常用 R18Tag","环境 朝朝暮暮","环境 日月星辰","环境 天涯海角","风格","非emoij的人物","角色","头发&发饰 长度","头发&发饰 颜色","头发&发饰 发型","头发&发型 辫子","头发&发型 刘海/其他","头发&发型 发饰","五官&表情 常用","五官&表情 R18","眼睛 颜色","眼睛 状态","眼睛 其他","身体 胸","身体 R18","服装 衣服","服装 R18","袜子&腿饰 袜子","袜子&腿饰 长筒袜","袜子&腿饰 连裤袜","袜子&腿饰 腿饰&组合","袜子&腿饰 裤袜","袜子&腿饰 R18","鞋 鞋子","装饰 装饰","动作 动作","动作 头发相关","动作 R18","Emoij 表情","Emoij 人物","Emoij 手势","Emoij 日常","Emoij 动物","Emoij 植物","Emoij 自然","Emoij 食物","R18 ","人体","姿势","发型","表情","眼睛","衣服","饰品","袜子","风格(画质)","环境","背景","物品"]

def seach(input, num):
    if len(input) != 0:
        input = [search.get(item) or [] for item in list(input)]
        index = 0
        for item in input:
            if index == 0:
                index = 1
                ss = set(item)
            else:
                ss = ss & set(item)
        input = [tags[item] for item in list(ss)]
        input = sorted(input, key=lambda item: int(
            item.get("num")), reverse=True)
    else:
        input = sorted(tags, key=lambda item: int(
            item.get("num")), reverse=True)
    return [i.get("tags")+"【"+i.get("chin")+"】$"+i.get("num")+"$*"+str(i.get("index"))+"*" for i in input[0:num]]


def text_to_check(text, num,r1818):
    input = seach(text, num)
    if "R18" not in r1818:
        jian=seach("R18",40000)
        input=[it for it in input if it not in jian]
    return gr.update(choices=input),[]


def radio_to_out(li):
    with open(path+"/storage.json") as storage:
        yuan = json.load(storage)
    text = ""
    for it in yuan:
        one = it.index("—")
        two = it.index("—", one+1)
        num = int(it[one+1:two])
        word = it.split("【")[0]
        if num < 0:
            fu = "[]"
            num = -num
        elif num > 0:
            fu = li[0:2]
            num -= 1
        else:
            continue
        text += fu[0]*num+word+fu[1]*num+","
    return text


def check_to_sub(check, radio, li):
    with open(path+"/storage.json") as storage:
        yuan = json.load(storage)
        yuanan = [item.split("—")[0] for item in yuan]
        check = [item+"—1—" for item in check if item not in yuanan]
        yuan = yuan+check
    with open(path+"/storage.json", "w", encoding="utf-8") as storage:
        storage.write(json.dumps(yuan))
    if radio:
        return gr.update(choices=yuan), radio_to_out(li)
    elif not check:
        return gr.update(choices=yuan), radio_to_out(li)
    else:
        return gr.update(choices=yuan, value=yuan[0]), radio_to_out(li)


def but_to_radio(radio, cho):
    try:
        with open(path+"/storage.json", "r", encoding="utf-8") as storage:
            yuan = json.load(storage)
        one = radio.index("—")
        two = radio.index("—", one+1)
        num = int(radio[one+1:two])
        num = num+1 if cho == "big" else num-1
        index = 0
        for it in yuan:
            if it == radio:
                radio = radio[0:one+1]+str(num)+radio[two:]
                yuan[index] = radio
                with open(path+"/storage.json", "w", encoding="utf-8") as storage:
                    storage.write(json.dumps(yuan))
                    return gr.update(choices=yuan, value=radio)
            index += 1
    except:
        return


def big_to_radio(radio):
    return but_to_radio(radio=radio, cho="big")


def small_to_radio(radio):
    return but_to_radio(radio=radio, cho="small")


def out_to_cli(outp):
    try:
        pf = pd.DataFrame([outp])
        pf.to_clipboard()
    except:
        return


'''def but_update(input):
    result=(gr.update(elem_id="warning") if input else gr.update(elem_id=None))
    return result,result'''

def delete_to_out(dele):
    with open (path+"/storage.json","w",encoding="utf-8") as storage:
        storage.write("[]")
    return gr.update(choices=[]),[],""

def rr(tex,nu,r1818):
    check=text_to_check(tex,nu,r1818)
    if "R18" in r1818:
        return gr.update(choices=choli),check[0],check[1]
    else:
        return gr.update(choices=[it for it in choli if "R18" not in it]),check[0],check[1]

def on_ui_tabs():
    with gr.Blocks() as block:
        with gr.Row():
            with gr.Column(scale=9):
                radio = gr.Radio(type="value", label="此处是已经加入的tag")
            with gr.Column(scale=1):
                big = gr.Button("增加选定tag权重")
                small = gr.Button("减少选定tag权重")
                delete=gr.Button("点我清空选中tag")
        with gr.Row():
            with gr.Column(scale=9):
                out = gr.Textbox(lines=7, max_lines=100, label="此处是输出的tag",interactive=True)
            with gr.Column(scale=1):
                li = ["{}(使用大括号作为增强符号)", "()(使用小括号作为增强符号)"]
                dro = gr.Dropdown(choices=li, value=li[0], interactive=True, label="此处选择增强符号形式")
                cli = gr.Button("点击我复制tag文本")
        text = gr.Textbox(lines=1, label="请在此处输入中文或英文关键词搜索tag")
        cho=gr.Radio(label="尝试一下这些大类分组吧",choices=[it for it in choli if "R18" not in it],type="value")
        with gr.Row():
            with gr.Column(scale=9):
                check = gr.CheckboxGroup(choices=seach("", 100), label="此处是搜索结果",value=[])
            with gr.Column(scale=1):
                sub = gr.Button(value="选中并提交tag")
                r18=gr.CheckboxGroup(choices=["R18"],value=[],label="一些选项")
                num = gr.Slider(minimum=1, maximum=500, step=1,value=100, label="此处是调整搜索结果个数")
        cho.change(fn=lambda it:it,inputs=cho,outputs=text)
        text.change(fn=text_to_check, inputs=[text, num,r18], outputs=[check,check])
        num.change(fn=text_to_check, inputs=[text, num,r18], outputs=[check,check])
        # check.change(fn=but_update,inputs=check,outputs=sub)
        sub.click(fn=check_to_sub, inputs=[check, radio, dro], outputs=[radio, out])
        # radio.change(fn=but_update,inputs=radio,outputs=[big,small])
        delete.click(fn=delete_to_out,inputs=delete,outputs=[radio,check,out])
        big.click(fn=big_to_radio, inputs=radio, outputs=radio)
        small.click(fn=small_to_radio, inputs=radio, outputs=radio)
        radio.change(fn=radio_to_out, inputs=dro, outputs=out)
        dro.change(fn=radio_to_out, inputs=dro, outputs=out)
        # out.change(fn=but_update,inputs=out,outputs=cli)
        cli.click(fn=out_to_cli, inputs=out)
        # return [text,check,sub,num,radio,big,small,out,dro,cli]
        r18.change(fn=rr,inputs=[text,num,r18],outputs=[cho,check,check])
    return [(block,"maple的tag选择器","maple_tags")]
script_callbacks.on_ui_tabs(on_ui_tabs)
# on_ui_tabs()[0][0].launch()