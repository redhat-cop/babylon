import React from 'react';
import { $getRoot, EditorState, LexicalEditor, TextNode } from 'lexical';
import { InitialEditorStateType, LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import LexicalErrorBoundary from '@lexical/react/LexicalErrorBoundary';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { AutoLinkNode, LinkNode } from '@lexical/link';
import { CodeHighlightNode, CodeNode } from '@lexical/code';
import { ListItemNode, ListNode } from '@lexical/list';
import { TableCellNode, TableNode, TableRowNode } from '@lexical/table';
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin';
import { TRANSFORMERS } from '@lexical/markdown';
import { $generateNodesFromDOM } from '@lexical/html';
import ToolbarPlugin from './ToolbarPlugin';
import Theme from './Theme';
import AutoLinkPlugin from './AutoLinkPlugin';

import './editor.css';

// Override the TextNode to detect bold/underline/italic and create an b/u/i element https://github.com/facebook/lexical/issues/2452
const exportDOM = TextNode.prototype.exportDOM;
const IS_UNDERLINE = 1 << 3;
const IS_ITALIC = 1 << 1;
const IS_BOLD = 1;
const getLastChildren = (parent: Element): Element => {
  const getLastChildrens = (parent: Element): Element[] => {
    return Array.from(parent.children).reduce<Element[]>((acc, node) => {
      const children = Array.from(node.children);
      if (children.length === 0) {
        acc.push(node);
        return acc;
      }
      return [...acc, ...getLastChildrens(node)];
    }, []);
  };
  if (parent.children.length === 0) return parent;
  return getLastChildrens(parent)[0];
};
TextNode.prototype.exportDOM = function (editor: LexicalEditor) {
  if (this.__format & IS_UNDERLINE || this.__format & IS_ITALIC || this.__format & IS_BOLD) {
    let dom: HTMLElement = null;
    if (this.__format & IS_UNDERLINE) {
      const el = document.createElement('u');
      dom ? getLastChildren(dom).appendChild(el) : (dom = el);
    }
    if (this.__format & IS_ITALIC) {
      const el = document.createElement('i');
      dom ? getLastChildren(dom).appendChild(el) : (dom = el);
    }
    if (this.__format & IS_BOLD) {
      const el = document.createElement('b');
      dom ? getLastChildren(dom).appendChild(el) : (dom = el);
    }
    const lastEl = getLastChildren(dom);
    lastEl.textContent = this.__text;
    return { element: dom };
  } else {
    return exportDOM.apply(this, [editor]);
  }
};

const Editor: React.FC<{
  onChange: (editorState: EditorState, editor: LexicalEditor) => void;
  placeholder: string;
  defaultValue?: string;
}> = ({ onChange, placeholder, defaultValue }) => {
  let _defaultValue: InitialEditorStateType = defaultValue;

  try {
    JSON.parse(defaultValue);
  } catch {
    _defaultValue = (editor) => {
      if (defaultValue) {
        const parser = new DOMParser();
        let dom = parser.parseFromString(defaultValue, 'text/html');
        if (!Array.from(dom.body.childNodes).some((node) => node.nodeType === 1)) {
          dom = parser.parseFromString(`<p>${defaultValue}</p>`, 'text/html');
        }
        const nodes = $generateNodesFromDOM(editor, dom);
        const root = $getRoot();
        root.clear();
        root.append(...nodes);
      }
    };
  }
  return (
    <div className="editor">
      <LexicalComposer
        initialConfig={{
          namespace: 'editor',
          editorState: _defaultValue,
          theme: Theme,
          nodes: [
            HeadingNode,
            ListNode,
            ListItemNode,
            QuoteNode,
            CodeNode,
            CodeHighlightNode,
            TableNode,
            TableCellNode,
            TableRowNode,
            AutoLinkNode,
            LinkNode,
          ],
          onError(error) {
            throw error;
          },
        }}
      >
        <div className="editor__container">
          <ToolbarPlugin />
          <div className="editor__inner">
            <RichTextPlugin
              contentEditable={<ContentEditable className="editor__input" />}
              placeholder={<div className="editor__placeholder">{placeholder}</div>}
              ErrorBoundary={LexicalErrorBoundary}
            />
            <OnChangePlugin onChange={onChange} ignoreSelectionChange />
            <HistoryPlugin />
            <ListPlugin />
            <LinkPlugin />
            <AutoLinkPlugin />
            <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
          </div>
        </div>
      </LexicalComposer>
    </div>
  );
};

export default Editor;
