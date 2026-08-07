import urllib.request
from html.parser import HTMLParser
import re

class MyHTMLParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_content = False
        self.text = []
        self.depth = 0
        self.current_tag = None
        
    def handle_starttag(self, tag, attrs):
        if not self.in_content:
            for attr in attrs:
                if attr[0] == 'class' and attr[1] and 'content-wrapper' in attr[1]:
                    self.in_content = True
                    self.depth = 1
                    break
        elif self.in_content:
            self.current_tag = tag
            if tag == 'div':
                self.depth += 1
            elif tag in ['p', 'h1', 'h2', 'h3', 'h4', 'li']:
                self.text.append(f'\n<{tag}>')

    def handle_endtag(self, tag):
        if self.in_content:
            if tag == 'div':
                self.depth -= 1
                if self.depth == 0:
                    self.in_content = False
            elif tag in ['p', 'h1', 'h2', 'h3', 'h4', 'li']:
                self.text.append(f'</{tag}>\n')

    def handle_data(self, data):
        if self.in_content and data.strip():
            self.text.append(data.strip() + " ")

url = 'https://nagpur.gov.in/history/'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
html = urllib.request.urlopen(req).read().decode('utf-8')
parser = MyHTMLParser()
parser.feed(html)

content = ''.join(parser.text)

with open('nagpur_history_clean.txt', 'w', encoding='utf-8') as f:
    f.write(content)
