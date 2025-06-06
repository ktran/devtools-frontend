// Copyright 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import type {Chrome} from '../../../extension-api/ExtensionAPI.js';
import type * as Platform from '../../core/platform/platform.js';
import type * as SDK from '../../core/sdk/sdk.js';
import * as Bindings from '../bindings/bindings.js';

import {PrivateAPI} from './ExtensionAPI.js';
import {ExtensionEndpoint} from './ExtensionEndpoint.js';

class LanguageExtensionEndpointImpl extends ExtensionEndpoint {
  private plugin: LanguageExtensionEndpoint;
  constructor(plugin: LanguageExtensionEndpoint, port: MessagePort) {
    super(port);
    this.plugin = plugin;
  }
  protected override handleEvent({event}: {event: string}): void {
    switch (event) {
      case PrivateAPI.LanguageExtensionPluginEvents.UnregisteredLanguageExtensionPlugin: {
        this.disconnect();
        const {pluginManager} = Bindings.DebuggerWorkspaceBinding.DebuggerWorkspaceBinding.instance();
        pluginManager.removePlugin(this.plugin);
        break;
      }
    }
  }
}

export class LanguageExtensionEndpoint implements Bindings.DebuggerLanguagePlugins.DebuggerLanguagePlugin {
  private readonly supportedScriptTypes: {
    language: string,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    symbol_types: string[],
  };
  private readonly endpoint: LanguageExtensionEndpointImpl;
  private readonly extensionOrigin: string;
  readonly allowFileAccess: boolean;
  readonly name: string;

  constructor(
      allowFileAccess: boolean, extensionOrigin: string, name: string, supportedScriptTypes: {
        language: string,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        symbol_types: string[],
      },
      port: MessagePort) {
    this.name = name;
    this.extensionOrigin = extensionOrigin;
    this.supportedScriptTypes = supportedScriptTypes;
    this.endpoint = new LanguageExtensionEndpointImpl(this, port);
    this.allowFileAccess = allowFileAccess;
  }

  canAccessURL(url: string): boolean {
    try {
      return !url || this.allowFileAccess || new URL(url).protocol !== 'file:';
    } catch {
      // If the URL isn't valid, it also isn't a valid file url and it's safe to tell the extensions about it.
      return true;
    }
  }

  handleScript(script: SDK.Script.Script): boolean {
    try {
      if (!this.canAccessURL(script.contentURL()) || (script.hasSourceURL && !this.canAccessURL(script.sourceURL)) ||
          (script.debugSymbols?.externalURL && !this.canAccessURL(script.debugSymbols.externalURL))) {
        return false;
      }
    } catch {
      return false;
    }
    const language = script.scriptLanguage();
    return language !== null && script.debugSymbols !== null && language === this.supportedScriptTypes.language &&
        this.supportedScriptTypes.symbol_types.includes(script.debugSymbols.type);
  }

  createPageResourceLoadInitiator(): SDK.PageResourceLoader.PageResourceLoadInitiator {
    return {
      target: null,
      frameId: null,
      extensionId: this.extensionOrigin,
      initiatorUrl: this.extensionOrigin as Platform.DevToolsPath.UrlString,
    };
  }

  /** Notify the plugin about a new script
   */
  addRawModule(rawModuleId: string, symbolsURL: string, rawModule: Chrome.DevTools.RawModule): Promise<string[]> {
    if (!this.canAccessURL(symbolsURL) || !this.canAccessURL(rawModule.url)) {
      return Promise.resolve([]);
    }
    return this.endpoint.sendRequest(
        PrivateAPI.LanguageExtensionPluginCommands.AddRawModule, {rawModuleId, symbolsURL, rawModule});
  }

  /**
   * Notifies the plugin that a script is removed.
   */
  removeRawModule(rawModuleId: string): Promise<void> {
    return this.endpoint.sendRequest(PrivateAPI.LanguageExtensionPluginCommands.RemoveRawModule, {rawModuleId});
  }

  /** Find locations in raw modules from a location in a source file
   */
  sourceLocationToRawLocation(sourceLocation: Chrome.DevTools.SourceLocation):
      Promise<Chrome.DevTools.RawLocationRange[]> {
    return this.endpoint.sendRequest(
        PrivateAPI.LanguageExtensionPluginCommands.SourceLocationToRawLocation, {sourceLocation});
  }

  /** Find locations in source files from a location in a raw module
   */
  rawLocationToSourceLocation(rawLocation: Chrome.DevTools.RawLocation): Promise<Chrome.DevTools.SourceLocation[]> {
    return this.endpoint.sendRequest(
        PrivateAPI.LanguageExtensionPluginCommands.RawLocationToSourceLocation, {rawLocation});
  }

  getScopeInfo(type: string): Promise<Chrome.DevTools.ScopeInfo> {
    return this.endpoint.sendRequest(PrivateAPI.LanguageExtensionPluginCommands.GetScopeInfo, {type});
  }

  /** List all variables in lexical scope at a given location in a raw module
   */
  listVariablesInScope(rawLocation: Chrome.DevTools.RawLocation): Promise<Chrome.DevTools.Variable[]> {
    return this.endpoint.sendRequest(PrivateAPI.LanguageExtensionPluginCommands.ListVariablesInScope, {rawLocation});
  }

  /** List all function names (including inlined frames) at location
   */
  getFunctionInfo(rawLocation: Chrome.DevTools.RawLocation): Promise<{
    frames: Chrome.DevTools.FunctionInfo[],
  }> {
    return this.endpoint.sendRequest(PrivateAPI.LanguageExtensionPluginCommands.GetFunctionInfo, {rawLocation});
  }

  /** Find locations in raw modules corresponding to the inline function
   *  that rawLocation is in.
   */
  getInlinedFunctionRanges(rawLocation: Chrome.DevTools.RawLocation): Promise<Chrome.DevTools.RawLocationRange[]> {
    return this.endpoint.sendRequest(
        PrivateAPI.LanguageExtensionPluginCommands.GetInlinedFunctionRanges, {rawLocation});
  }

  /** Find locations in raw modules corresponding to inline functions
   *  called by the function or inline frame that rawLocation is in.
   */
  getInlinedCalleesRanges(rawLocation: Chrome.DevTools.RawLocation): Promise<Chrome.DevTools.RawLocationRange[]> {
    return this.endpoint.sendRequest(PrivateAPI.LanguageExtensionPluginCommands.GetInlinedCalleesRanges, {rawLocation});
  }

  async getMappedLines(rawModuleId: string, sourceFileURL: string): Promise<number[]|undefined> {
    return await this.endpoint.sendRequest(
        PrivateAPI.LanguageExtensionPluginCommands.GetMappedLines, {rawModuleId, sourceFileURL});
  }

  async evaluate(expression: string, context: Chrome.DevTools.RawLocation, stopId: number):
      Promise<Chrome.DevTools.RemoteObject> {
    return await this.endpoint.sendRequest(
        PrivateAPI.LanguageExtensionPluginCommands.FormatValue, {expression, context, stopId});
  }

  getProperties(objectId: Chrome.DevTools.RemoteObjectId): Promise<Chrome.DevTools.PropertyDescriptor[]> {
    return this.endpoint.sendRequest(PrivateAPI.LanguageExtensionPluginCommands.GetProperties, {objectId});
  }

  releaseObject(objectId: Chrome.DevTools.RemoteObjectId): Promise<void> {
    return this.endpoint.sendRequest(PrivateAPI.LanguageExtensionPluginCommands.ReleaseObject, {objectId});
  }
}
